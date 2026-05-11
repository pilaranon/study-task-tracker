const taskForm = document.getElementById("taskForm");
const taskTableBody = document.getElementById("taskTableBody");
const sortSelect = document.getElementById("sortSelect");
const taskSubmitBtn = document.getElementById("taskSubmitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

const taskViewBtn = document.getElementById("taskViewBtn");
const completedViewBtn = document.getElementById("completedViewBtn");
const calendarViewBtn = document.getElementById("calendarViewBtn");

const taskView = document.getElementById("taskView");
const calendarView = document.getElementById("calendarView");
const calendarContainer = document.getElementById("calendarContainer");
const taskTooltip = document.getElementById("taskTooltip");
const messageArea = document.getElementById("messageArea");
const confirmPopup = document.getElementById("confirmPopup");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const activeCount = document.getElementById("activeCount");
const dueTodayCount = document.getElementById("dueTodayCount");
const highPriorityCount = document.getElementById("highPriorityCount");
const completedCount = document.getElementById("completedCount");

const userIconBtn = document.getElementById("userIconBtn");
const userDropdown = document.getElementById("userDropdown");

let currentStatusFilter = "active";
let editingTaskId = null;
let allTasks = [];
let messageTimeoutId = null;
let confirmResolver = null;

function showMessage(message, type = "error") {
    if (!messageArea) {
        return;
    }

    window.clearTimeout(messageTimeoutId);
    messageArea.textContent = message;
    messageArea.className = `message-area ${type}`;

    messageTimeoutId = window.setTimeout(function () {
        messageArea.classList.add("hidden");
    }, 6000);
}

function clearMessage() {
    if (!messageArea) {
        return;
    }

    window.clearTimeout(messageTimeoutId);
    messageArea.textContent = "";
    messageArea.className = "message-area hidden";
}

async function requestJson(url, options = {}, fallbackMessage = "Something went wrong.") {
    let response;

    try {
        response = await fetch(url, options);
    } catch (error) {
        throw new Error("Network error. Please check your connection and try again.");
    }

    const contentType = response.headers.get("content-type") || "";
    let data = null;

    if (contentType.includes("application/json")) {
        try {
            data = await response.json();
        } catch (error) {
            data = null;
        }
    }

    if (!response.ok) {
        throw new Error(data?.error || fallbackMessage);
    }

    return data;
}

function closeDeleteConfirmation(confirmed) {
    if (!confirmPopup) {
        return;
    }

    confirmPopup.classList.add("hidden");

    if (confirmResolver) {
        const resolve = confirmResolver;
        confirmResolver = null;
        resolve(confirmed);
    }
}

function showDeleteConfirmation(message) {
    if (!confirmPopup || !confirmMessage || !confirmCancelBtn) {
        return Promise.resolve(false);
    }

    if (confirmResolver) {
        closeDeleteConfirmation(false);
    }

    confirmMessage.textContent = message;
    confirmPopup.classList.remove("hidden");
    confirmCancelBtn.focus();

    return new Promise(function (resolve) {
        confirmResolver = resolve;
    });
}

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

    try {
        const [tasks, summaryTasks] = await Promise.all([
            requestJson(url, {}, "Failed to load tasks."),
            requestJson("/tasks", {}, "Failed to load summary.")
        ]);

        allTasks = tasks;

        updateSummary(summaryTasks);
        renderTaskTable(tasks);
        renderCalendarView(tasks);
        clearMessage();
    } catch (error) {
        showMessage(error.message || "Failed to load tasks.");
        return;
    }
}

function updateSummary(tasks) {
    const today = formatDateForInput(new Date());
    const activeTasks = tasks.filter(task => !task.completed);
    const completedTasks = tasks.filter(task => task.completed);
    const dueTodayTasks = activeTasks.filter(task => task.due_date === today);
    const highPriorityTasks = activeTasks.filter(task => task.priority === "high");

    setCounter(activeCount, activeTasks.length);
    setCounter(dueTodayCount, dueTodayTasks.length);
    setCounter(highPriorityCount, highPriorityTasks.length);
    setCounter(completedCount, completedTasks.length);
}

function setCounter(element, value) {
    if (!element) {
        return;
    }

    element.textContent = value;
}

function renderTaskTable(tasks) {
    taskTableBody.replaceChildren();

    if (tasks.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.className = "empty-message";
        cell.textContent = getEmptyMessage();

        row.appendChild(cell);
        taskTableBody.appendChild(row);
        return;
    }

    tasks.forEach(task => {
        const row = document.createElement("tr");

        if (task.completed) {
            row.classList.add("completed");
        }

        row.appendChild(createTaskCell(task));
        row.appendChild(createTextCell(formatDate(task.date_created), "Created", "muted-cell"));
        row.appendChild(createDueDateCell(task.due_date));
        row.appendChild(createPriorityCell(task.priority));
        row.appendChild(createStatusCell(task.completed));

        const actionsCell = document.createElement("td");
        actionsCell.dataset.label = "Actions";
        actionsCell.className = "action-cell";

        const editButton = createActionButton("Edit", "edit-btn", function () {
            editTask(task.id);
        });
        const completeButton = createActionButton(
            task.completed ? "Undo" : "Complete",
            "complete-btn",
            function () {
                if (task.completed) {
                    incompleteTask(task.id);
                } else {
                    completeTask(task.id);
                }
            }
        );
        const deleteButton = createActionButton("Delete", "delete-btn", function () {
            deleteTask(task.id);
        });

        actionsCell.append(editButton, completeButton, deleteButton);
        row.appendChild(actionsCell);

        taskTableBody.appendChild(row);
    });
}

function getEmptyMessage() {
    if (currentStatusFilter === "completed") {
        return "No completed tasks yet.";
    }

    return "No active tasks yet.";
}

function createTaskCell(task) {
    const cell = document.createElement("td");
    cell.dataset.label = "Task";
    cell.className = "task-title-cell";

    const title = document.createElement("strong");
    title.textContent = task.title;

    cell.appendChild(title);

    if (task.description) {
        const description = document.createElement("span");
        description.textContent = task.description;
        cell.appendChild(description);
    }

    return cell;
}

function createTextCell(text, label, className = "") {
    const cell = document.createElement("td");
    cell.dataset.label = label;

    if (className) {
        cell.className = className;
    }

    cell.textContent = text;
    return cell;
}

function createDueDateCell(dueDate) {
    const cell = document.createElement("td");
    cell.dataset.label = "Due";

    const badge = document.createElement("span");
    badge.className = `date-pill ${getDueDateClass(dueDate)}`;
    badge.textContent = dueDate ? formatDisplayDate(dueDate) : "No date";

    cell.appendChild(badge);
    return cell;
}

function createPriorityCell(priority) {
    const cell = document.createElement("td");
    cell.dataset.label = "Priority";

    const pill = document.createElement("span");
    pill.className = `priority-pill priority-${priority}`;
    pill.textContent = capitalize(priority);

    cell.appendChild(pill);
    return cell;
}

function createStatusCell(completed) {
    const cell = document.createElement("td");
    cell.dataset.label = "Status";

    const pill = document.createElement("span");
    pill.className = completed ? "status-pill status-complete" : "status-pill status-active";
    pill.textContent = completed ? "Complete" : "Active";

    cell.appendChild(pill);
    return cell;
}

function createActionButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action-btn ${className}`;
    button.textContent = label;
    button.title = label;
    button.addEventListener("click", onClick);
    return button;
}

function renderCalendarView(tasks) {
    calendarContainer.innerHTML = "";

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startDay = firstDayOfMonth.getDay();
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalCalendarCells = Math.ceil((startDay + lastDayOfMonth.getDate()) / 7) * 7;

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

    for (let i = 0; i < totalCalendarCells; i++) {
        const currentDate = new Date(calendarStartDate);
        currentDate.setDate(calendarStartDate.getDate() + i);

        const dateString = formatDateForInput(currentDate);

        const dayCell = document.createElement("div");
        dayCell.classList.add("calendar-day");

        if (currentDate.getMonth() !== month) {
            dayCell.classList.add("outside-month");
        }

        if (dateString === formatDateForInput(today)) {
            dayCell.classList.add("today");
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
                renderTaskTooltip(task);

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

function renderTaskTooltip(task) {
    taskTooltip.replaceChildren();

    const title = document.createElement("strong");
    title.textContent = task.title;

    const description = document.createElement("span");
    description.textContent = task.description || "No description";

    taskTooltip.append(
        title,
        document.createElement("br"),
        description,
        document.createElement("br"),
        document.createElement("br")
    );

    appendTooltipLine("Due:", task.due_date || "No due date");
    appendTooltipLine("Priority:", capitalize(task.priority));
    appendTooltipLine("Status:", task.completed ? "Complete" : "Incomplete");
}

function appendTooltipLine(label, value) {
    const labelElement = document.createElement("strong");
    labelElement.textContent = label;

    taskTooltip.append(labelElement, ` ${value}`, document.createElement("br"));
}

taskForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const taskData = {
        title: document.getElementById("title").value,
        description: document.getElementById("description").value,
        due_date: document.getElementById("dueDate").value,
        priority: document.getElementById("priority").value
    };

    try {
        if (editingTaskId) {
            await requestJson(
                `/tasks/${editingTaskId}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(taskData)
                },
                "Failed to update task."
            );

            editingTaskId = null;
            setEditingState(false);
        } else {
            await requestJson(
                "/tasks",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(taskData)
                },
                "Failed to create task."
            );
        }

        taskForm.reset();
        setEditingState(false);
        loadTasks();
    } catch (error) {
        showMessage(error.message || "Failed to save task.");
    }
});

function editTask(id) {
    const task = allTasks.find(t => t.id === id);

    if (!task) {
        showMessage("Could not find that task. Refresh the page and try again.");
        return;
    }

    editingTaskId = id;

    document.getElementById("title").value = task.title;
    document.getElementById("description").value = task.description || "";
    document.getElementById("dueDate").value = task.due_date || "";
    document.getElementById("priority").value = task.priority;

    setEditingState(true);

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function setEditingState(isEditing) {
    if (taskSubmitBtn) {
        taskSubmitBtn.textContent = isEditing ? "Update task" : "Add task";
    }

    if (cancelEditBtn) {
        cancelEditBtn.classList.toggle("hidden", !isEditing);
    }
}

function resetTaskForm() {
    editingTaskId = null;
    taskForm.reset();
    setEditingState(false);
}

async function deleteTask(id) {
    const task = allTasks.find(t => t.id === id);
    const taskName = task ? `"${task.title}"` : "this task";

    const confirmed = await showDeleteConfirmation(`Delete ${taskName}? This cannot be undone.`);

    if (!confirmed) {
        return;
    }

    try {
        await requestJson(
            `/tasks/${id}`,
            {
                method: "DELETE"
            },
            "Failed to delete task."
        );

        loadTasks();
    } catch (error) {
        showMessage(error.message || "Failed to delete task.");
    }
}

async function completeTask(id) {
    try {
        await requestJson(
            `/tasks/${id}/complete`,
            {
                method: "PATCH"
            },
            "Failed to mark task complete."
        );

        loadTasks();
    } catch (error) {
        showMessage(error.message || "Failed to mark task complete.");
    }
}

async function incompleteTask(id) {
    try {
        await requestJson(
            `/tasks/${id}/incomplete`,
            {
                method: "PATCH"
            },
            "Failed to mark task incomplete."
        );

        loadTasks();
    } catch (error) {
        showMessage(error.message || "Failed to mark task incomplete.");
    }
}

sortSelect.addEventListener("change", loadTasks);

cancelEditBtn.addEventListener("click", resetTaskForm);

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
    const isOpen = userDropdown.classList.toggle("hidden") === false;
    userIconBtn.setAttribute("aria-expanded", String(isOpen));
});

confirmCancelBtn.addEventListener("click", function () {
    closeDeleteConfirmation(false);
});

confirmDeleteBtn.addEventListener("click", function () {
    closeDeleteConfirmation(true);
});

document.addEventListener("click", function (event) {
    if (!userIconBtn.contains(event.target) && !userDropdown.contains(event.target)) {
        userDropdown.classList.add("hidden");
        userIconBtn.setAttribute("aria-expanded", "false");
    }
});

document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && confirmPopup && !confirmPopup.classList.contains("hidden")) {
        closeDeleteConfirmation(false);
    }
});

function capitalize(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function formatDisplayDate(dateString) {
    const date = parseLocalDate(dateString);

    if (!date) {
        return "";
    }

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric"
    });
}

function parseLocalDate(dateString) {
    if (!dateString) {
        return null;
    }

    const [year, month, day] = dateString.split("-").map(Number);

    if (!year || !month || !day) {
        return null;
    }

    return new Date(year, month - 1, day);
}

function getDueDateClass(dateString) {
    if (!dateString) {
        return "date-none";
    }

    const dueDate = parseLocalDate(dateString);
    const today = new Date();

    if (!dueDate) {
        return "date-none";
    }

    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < today) {
        return "date-overdue";
    }

    if (dueDate.getTime() === today.getTime()) {
        return "date-today";
    }

    return "date-upcoming";
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

loadTasks();
