from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from sqlalchemy import case
from datetime import datetime
from functools import wraps

app = Flask(__name__)

app.config["SECRET_KEY"] = "dev-secret-key"
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///tasks.db"
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
    due_date = db.Column(db.String(20))
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
        query = query.order_by(Task.due_date.asc())

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
            "due_date": task.due_date,
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

    task = Task(
        user_id=current_user_id(),
        title=title,
        description=data.get("description", ""),
        due_date=data.get("due_date", ""),
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
    task.due_date = data.get("due_date", task.due_date)
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
        db.create_all()

    app.run(debug=True)