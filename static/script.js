const taskForm = document.getElementById("taskForm");
const taskTableBody = document.getElementById("taskTableBody");
const sortSelect = document.getElementById("sortSelect");

const taskViewBtn = document.getElementById("taskViewBtn");
const completedViewBtn = document.getElementById("completedViewBtn");
const calendarViewBtn = document.getElementById("calendarViewBtn");

const taskView = document.getElementById("taskView");
const calendarView = document.getElementById("calendarView");
const calendarContainer = document.getElementById("calendarContainer");
const taskTooltip = document.getElementById("taskTooltip");

const userIconBtn = document.getElementById("userIconBtn");
const userDropdown = document.getElementById("userDropdown");

let currentStatusFilter = "active";
let editingTaskId = null;
let allTasks = [];

async function loadTasks() {
    let url = "/tasks";
    const params = new URLSearchParams();

    if (sortSelect.value) {
        params.append("sort", sortSelect.value);
    }

    if (currentStatusFilter) {
        params.append("status", currentStatusFilter);
    }

    if (params.toString()) {
        url += `?${params.toString()}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
        console.error("Failed to load tasks.");
        return;
    }

    const tasks = await response.json();

    allTasks = tasks;

    renderTaskTable(tasks);
    renderCalendarView(tasks);
}

function renderTaskTable(tasks) {
    taskTableBody.innerHTML = "";

    if (tasks.length === 0) {
        taskTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-message">No tasks found.</td>
            </tr>
        `;
        return;
    }

    tasks.forEach(task => {
        const row = document.createElement("tr");

        if (task.completed) {
            row.classList.add("completed");
        }

        row.innerHTML = `
            <td>${task.title}</td>
            <td>${task.description || ""}</td>
            <td>${formatDate(task.date_created)}</td>
            <td>${task.due_date || ""}</td>
            <td>${capitalize(task.priority)}</td>
            <td>${task.completed ? "Complete" : "Incomplete"}</td>
            <td>
                <button class="action-btn edit-btn" onclick="editTask(${task.id})">Edit</button>
                ${
                    task.completed
                        ? `<button class="action-btn complete-btn" onclick="incompleteTask(${task.id})">Undo</button>`
                        : `<button class="action-btn complete-btn" onclick="completeTask(${task.id})">Complete</button>`
                }
                <button class="action-btn delete-btn" onclick="deleteTask(${task.id})">Delete</button>
            </td>
        `;

        taskTableBody.appendChild(row);
    });
}

function renderCalendarView(tasks) {
    calendarContainer.innerHTML = "";

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startDay = firstDayOfMonth.getDay();

    const calendarStartDate = new Date(year, month, 1 - startDay);

    const monthTitle = document.createElement("h3");
    monthTitle.textContent = today.toLocaleString("default", {
        month: "long",
        year: "numeric"
    });

    const calendarGrid = document.createElement("div");
    calendarGrid.classList.add("calendar-grid");

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    dayNames.forEach(day => {
        const dayHeader = document.createElement("div");
        dayHeader.classList.add("calendar-day-header");
        dayHeader.textContent = day;
        calendarGrid.appendChild(dayHeader);
    });

    for (let i = 0; i < 35; i++) {
        const currentDate = new Date(calendarStartDate);
        currentDate.setDate(calendarStartDate.getDate() + i);

        const dateString = formatDateForInput(currentDate);

        const dayCell = document.createElement("div");
        dayCell.classList.add("calendar-day");

        if (currentDate.getMonth() !== month) {
            dayCell.classList.add("outside-month");
        }

        const dayNumber = document.createElement("div");
        dayNumber.classList.add("calendar-day-number");
        dayNumber.textContent = currentDate.getDate();

        dayCell.appendChild(dayNumber);

        const tasksForDay = tasks.filter(task => task.due_date === dateString);

        tasksForDay.forEach(task => {
            const taskItem = document.createElement("div");
            taskItem.classList.add("calendar-task-item");

            if (task.completed) {
                taskItem.classList.add("completed");
            }

            taskItem.textContent = task.title;

            taskItem.addEventListener("mouseenter", function () {
                taskTooltip.innerHTML = `
                    <strong>${task.title}</strong><br>
                    <span>${task.description || "No description"}</span><br><br>
                    <strong>Due:</strong> ${task.due_date || "No due date"}<br>
                    <strong>Priority:</strong> ${capitalize(task.priority)}<br>
                    <strong>Status:</strong> ${task.completed ? "Complete" : "Incomplete"}
                `;

                taskTooltip.classList.remove("hidden");
            });

            taskItem.addEventListener("mousemove", function (event) {
                taskTooltip.style.left = event.pageX + 15 + "px";
                taskTooltip.style.top = event.pageY + 15 + "px";
            });

            taskItem.addEventListener("mouseleave", function () {
                taskTooltip.classList.add("hidden");
            });

            dayCell.appendChild(taskItem);
        });

        calendarGrid.appendChild(dayCell);
    }

    calendarContainer.appendChild(monthTitle);
    calendarContainer.appendChild(calendarGrid);
}

taskForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const taskData = {
        title: document.getElementById("title").value,
        description: document.getElementById("description").value,
        due_date: document.getElementById("dueDate").value,
        priority: document.getElementById("priority").value
    };

    if (editingTaskId) {
        await fetch(`/tasks/${editingTaskId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(taskData)
        });

        editingTaskId = null;
        taskForm.querySelector("button").textContent = "Add Task";
    } else {
        await fetch("/tasks", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(taskData)
        });
    }

    taskForm.reset();
    loadTasks();
});

function editTask(id) {
    const task = allTasks.find(t => t.id === id);

    if (!task) {
        return;
    }

    editingTaskId = id;

    document.getElementById("title").value = task.title;
    document.getElementById("description").value = task.description || "";
    document.getElementById("dueDate").value = task.due_date || "";
    document.getElementById("priority").value = task.priority;

    taskForm.querySelector("button").textContent = "Update Task";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

async function deleteTask(id) {
    await fetch(`/tasks/${id}`, {
        method: "DELETE"
    });

    loadTasks();
}

async function completeTask(id) {
    await fetch(`/tasks/${id}/complete`, {
        method: "PATCH"
    });

    loadTasks();
}

async function incompleteTask(id) {
    await fetch(`/tasks/${id}/incomplete`, {
        method: "PATCH"
    });

    loadTasks();
}

sortSelect.addEventListener("change", loadTasks);

taskViewBtn.addEventListener("click", function () {
    currentStatusFilter = "active";

    taskView.classList.remove("hidden");
    calendarView.classList.add("hidden");

    taskViewBtn.classList.add("active-view");
    completedViewBtn.classList.remove("active-view");
    calendarViewBtn.classList.remove("active-view");

    loadTasks();
});

completedViewBtn.addEventListener("click", function () {
    currentStatusFilter = "completed";

    taskView.classList.remove("hidden");
    calendarView.classList.add("hidden");

    completedViewBtn.classList.add("active-view");
    taskViewBtn.classList.remove("active-view");
    calendarViewBtn.classList.remove("active-view");

    loadTasks();
});

calendarViewBtn.addEventListener("click", function () {
    currentStatusFilter = "active";

    taskView.classList.add("hidden");
    calendarView.classList.remove("hidden");

    calendarViewBtn.classList.add("active-view");
    taskViewBtn.classList.remove("active-view");
    completedViewBtn.classList.remove("active-view");

    loadTasks();
});

userIconBtn.addEventListener("click", function () {
    userDropdown.classList.toggle("hidden");
});

document.addEventListener("click", function (event) {
    if (!userIconBtn.contains(event.target) && !userDropdown.contains(event.target)) {
        userDropdown.classList.add("hidden");
    }
});

function capitalize(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

loadTasks();