from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from sqlalchemy import case, text
from datetime import date, datetime
from functools import wraps
import os

app = Flask(__name__)

database_url = os.getenv("DATABASE_URL", "sqlite:///tasks.db")

# SQLAlchemy expects "postgresql://", but some hosts/tools may provide "postgres://"
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-key")
app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["100 per hour"]
)

# -------------------------
# Database Models
# -------------------------

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    tasks = db.relationship("Task", backref="user", lazy=True)


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)

    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    due_date = db.Column(db.Date)
    priority = db.Column(db.String(20), default="low")
    completed = db.Column(db.Boolean, default=False)


# -------------------------
# Helper Functions
# -------------------------

def login_required(route_function):
    @wraps(route_function)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/tasks"):
                return jsonify({"error": "You must be logged in"}), 401
            return redirect(url_for("login"))
        return route_function(*args, **kwargs)
    return wrapper


def current_user_id():
    return session.get("user_id")


def parse_due_date(value):
    if value in (None, ""):
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    if not isinstance(value, str):
        raise ValueError("Due date must use YYYY-MM-DD format.")

    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as error:
        raise ValueError("Due date must use YYYY-MM-DD format.") from error


def format_due_date(value):
    if not value:
        return ""

    if isinstance(value, str):
        return value

    return value.isoformat()


def format_existing_due_date(value):
    try:
        parsed_date = parse_due_date(value)
    except ValueError:
        return None

    return parsed_date.isoformat() if parsed_date else None


def migrate_due_date_column():
    if db.engine.dialect.name == "sqlite":
        migrate_sqlite_due_date_column()
    elif db.engine.dialect.name == "postgresql":
        migrate_postgres_due_date_column()


def migrate_sqlite_due_date_column():
    with db.engine.begin() as connection:
        columns = connection.execute(text("PRAGMA table_info(task)")).mappings().all()

        if not columns:
            return

        due_date_column = next(
            (column for column in columns if column["name"] == "due_date"),
            None
        )

        if not due_date_column or due_date_column["type"].upper() == "DATE":
            return

        tasks = connection.execute(text("""
            SELECT id, user_id, title, description, date_created, due_date, priority, completed
            FROM task
        """)).mappings().all()

        connection.execute(text("PRAGMA foreign_keys=OFF"))
        connection.execute(text("ALTER TABLE task RENAME TO task_old"))
        connection.execute(text("""
            CREATE TABLE task (
                id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                title VARCHAR(120) NOT NULL,
                description TEXT,
                date_created DATETIME,
                due_date DATE,
                priority VARCHAR(20),
                completed BOOLEAN,
                PRIMARY KEY (id),
                FOREIGN KEY(user_id) REFERENCES user (id)
            )
        """))

        for task in tasks:
            connection.execute(
                text("""
                    INSERT INTO task (
                        id, user_id, title, description, date_created, due_date, priority, completed
                    )
                    VALUES (
                        :id, :user_id, :title, :description, :date_created, :due_date, :priority, :completed
                    )
                """),
                {
                    "id": task["id"],
                    "user_id": task["user_id"],
                    "title": task["title"],
                    "description": task["description"],
                    "date_created": task["date_created"],
                    "due_date": format_existing_due_date(task["due_date"]),
                    "priority": task["priority"],
                    "completed": task["completed"]
                }
            )

        connection.execute(text("DROP TABLE task_old"))
        connection.execute(text("PRAGMA foreign_keys=ON"))


def migrate_postgres_due_date_column():
    with db.engine.begin() as connection:
        column_type = connection.execute(
            text("""
                SELECT data_type
                FROM information_schema.columns
                WHERE table_name = 'task'
                AND column_name = 'due_date'
            """)
        ).scalar()

        if column_type and column_type != "date":
            connection.execute(text("""
                ALTER TABLE task
                ALTER COLUMN due_date TYPE DATE
                USING NULLIF(due_date, '')::date
            """))


def initialize_database():
    db.create_all()
    migrate_due_date_column()


# -------------------------
# Page Routes
# -------------------------

@app.route("/")
def home():
    if "user_id" not in session:
        return redirect(url_for("login"))
    return render_template("dashboard.html", username=session.get("username"))


@app.route("/register", methods=["GET", "POST"])
@limiter.limit("10 per minute")
def register():
    if request.method == "GET":
        return render_template("register.html")

    username = request.form.get("username")
    password = request.form.get("password")

    if not username or not password:
        return render_template("register.html", error="Username and password are required.")

    existing_user = User.query.filter_by(username=username).first()

    if existing_user:
        return render_template("register.html", error="Username already exists.")

    password_hash = bcrypt.generate_password_hash(password).decode("utf-8")

    new_user = User(
        username=username,
        password_hash=password_hash
    )

    db.session.add(new_user)
    db.session.commit()

    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
@limiter.limit("10 per minute")
def login():
    if request.method == "GET":
        return render_template("login.html")

    username = request.form.get("username")
    password = request.form.get("password")

    user = User.query.filter_by(username=username).first()

    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return render_template("login.html", error="Invalid username or password.")

    session["user_id"] = user.id
    session["username"] = user.username

    return redirect(url_for("home"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# -------------------------
# API Routes
# -------------------------

@app.route("/api/status", methods=["GET"])
def status():
    return jsonify({"message": "Study Planner API is running"})


@app.route("/tasks", methods=["GET"])
@login_required
def get_tasks():
    sort = request.args.get("sort")
    status_filter = request.args.get("status")

    query = Task.query.filter_by(user_id=current_user_id())

    if status_filter == "completed":
        query = query.filter_by(completed=True)
    elif status_filter == "active":
        query = query.filter_by(completed=False)

    if sort == "due_date":
        query = query.order_by(Task.due_date.is_(None), Task.due_date.asc())

    elif sort == "priority":
        priority_order = case(
            (Task.priority == "high", 1),
            (Task.priority == "medium", 2),
            (Task.priority == "low", 3),
            else_=4
        )
        query = query.order_by(priority_order)

    tasks = query.all()

    return jsonify([
        {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "date_created": task.date_created.isoformat() if task.date_created else None,
            "due_date": format_due_date(task.due_date),
            "priority": task.priority,
            "completed": task.completed
        }
        for task in tasks
    ])


@app.route("/tasks", methods=["POST"])
@login_required
@limiter.limit("20 per minute")
def create_task():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    title = data.get("title")

    if not title:
        return jsonify({"error": "Task title is required"}), 400

    try:
        due_date = parse_due_date(data.get("due_date"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    task = Task(
        user_id=current_user_id(),
        title=title,
        description=data.get("description", ""),
        due_date=due_date,
        priority=data.get("priority", "low")
    )

    db.session.add(task)
    db.session.commit()

    return jsonify({
        "message": "Task created",
        "task_id": task.id
    }), 201


@app.route("/tasks/<int:task_id>", methods=["PUT"])
@login_required
@limiter.limit("20 per minute")
def update_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user_id()).first_or_404()
    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing JSON body"}), 400

    task.title = data.get("title", task.title)
    task.description = data.get("description", task.description)

    if "due_date" in data:
        try:
            task.due_date = parse_due_date(data["due_date"])
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

    task.priority = data.get("priority", task.priority)

    db.session.commit()

    return jsonify({"message": "Task updated"})


@app.route("/tasks/<int:task_id>", methods=["DELETE"])
@login_required
@limiter.limit("20 per minute")
def delete_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user_id()).first_or_404()

    db.session.delete(task)
    db.session.commit()

    return jsonify({"message": "Task deleted"})


@app.route("/tasks/<int:task_id>/complete", methods=["PATCH"])
@login_required
@limiter.limit("20 per minute")
def complete_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user_id()).first_or_404()

    task.completed = True
    db.session.commit()

    return jsonify({"message": "Task marked complete"})


@app.route("/tasks/<int:task_id>/incomplete", methods=["PATCH"])
@login_required
@limiter.limit("20 per minute")
def incomplete_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user_id()).first_or_404()

    task.completed = False
    db.session.commit()

    return jsonify({"message": "Task marked incomplete"})


# -------------------------
# Run App
# -------------------------

if __name__ == "__main__":
    with app.app_context():
        initialize_database()

    app.run(debug=True)
