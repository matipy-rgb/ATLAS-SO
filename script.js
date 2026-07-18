const currentDate = document.querySelector("#currentDate");
const currentTime = document.querySelector("#currentTime");
const greeting = document.querySelector("#greeting");

const progressText = document.querySelector("#progressText");
const progressBar = document.querySelector("#progressBar");
const statusMessage = document.querySelector("#statusMessage");

const taskInput = document.querySelector("#taskInput");
const taskCategory = document.querySelector("#taskCategory");
const taskPriority = document.querySelector("#taskPriority");
const addTaskButton = document.querySelector("#addTaskButton");
const taskList = document.querySelector("#taskList");

const filterButtons =
    document.querySelectorAll(".filter-button");

const categories = {
    work: {
        label: "Trabajo",
        icon: "💼"
    },
    study: {
        label: "Estudios",
        icon: "🎓"
    },
    finance: {
        label: "Finanzas",
        icon: "💰"
    },
    health: {
        label: "Salud",
        icon: "💪"
    },
    projects: {
        label: "Proyectos",
        icon: "🛠️"
    },
    personal: {
        label: "Personal",
        icon: "👤"
    }
};

function loadTasks() {
    try {
        const storedTasks =
            JSON.parse(localStorage.getItem("atlasTasks")) || [];

        return storedTasks.map(function (task) {
            return {
                text: task.text,
                completed: Boolean(task.completed),
                category: task.category || "personal",
                priority: task.priority || "normal"
            };
        });
    } catch (error) {
        console.error("No se pudieron cargar las tareas:", error);
        return [];
    }
}

let tasks = loadTasks();
let currentFilter = "all";

currentDate.textContent = new Intl.DateTimeFormat("es-PY", {
    dateStyle: "full"
}).format(new Date());

function updateClock() {
    const now = new Date();
    const hour = now.getHours();

    if (hour < 12) {
        greeting.textContent = "Buen día";
    } else if (hour < 19) {
        greeting.textContent = "Buenas tardes";
    } else {
        greeting.textContent = "Buenas noches";
    }

    currentTime.textContent = new Intl.DateTimeFormat("es-PY", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(now);
}

function saveTasks() {
    localStorage.setItem(
        "atlasTasks",
        JSON.stringify(tasks)
    );
}

function updateProgress() {
    const totalTasks = tasks.length;

    const completedTasks = tasks.filter(function (task) {
        return task.completed;
    }).length;

    const progress = totalTasks === 0
        ? 0
        : Math.round((completedTasks / totalTasks) * 100);

    progressText.textContent = `${progress}%`;
    progressBar.style.width = `${progress}%`;

    if (totalTasks === 0) {
        statusMessage.textContent =
            "Todavía no agregaste tareas.";
    } else if (progress === 100) {
        statusMessage.textContent =
            "Objetivo diario completado.";
    } else {
        statusMessage.textContent =
            `${completedTasks} de ${totalTasks} tareas completadas.`;
    }
}

function updateModuleCounts() {
    const counters =
        document.querySelectorAll("[data-category-count]");

    counters.forEach(function (counter) {
        const category = counter.dataset.categoryCount;

        const pendingTasks = tasks.filter(function (task) {
            return (
                task.category === category &&
                !task.completed
            );
        }).length;

        counter.textContent = pendingTasks;
    });
}

function getVisibleTasks() {
    return tasks
        .map(function (task, index) {
            return {
                task: task,
                originalIndex: index
            };
        })
        .filter(function (item) {
            if (currentFilter === "pending") {
                return !item.task.completed;
            }

            if (currentFilter === "completed") {
                return item.task.completed;
            }

            return true;
        });
}

function renderTasks() {
    taskList.innerHTML = "";

    const visibleTasks = getVisibleTasks();

    if (visibleTasks.length === 0) {
        const emptyMessage = document.createElement("li");

        emptyMessage.className = "empty-state";
        emptyMessage.textContent =
            "No hay tareas en esta sección.";

        taskList.appendChild(emptyMessage);
    }

    visibleTasks.forEach(function (item) {
        const task = item.task;
        const index = item.originalIndex;

        const category =
            categories[task.category] || categories.personal;

        const taskItem = document.createElement("li");
        const checkbox = document.createElement("input");
        const taskContent = document.createElement("div");
        const taskText = document.createElement("span");
        const taskMeta = document.createElement("div");
        const categoryBadge = document.createElement("span");
        const priorityBadge = document.createElement("span");
        const deleteButton = document.createElement("button");

        taskItem.className = task.completed
            ? "task-item completed"
            : "task-item";

        checkbox.type = "checkbox";
        checkbox.checked = task.completed;

        taskContent.className = "task-content";

        taskText.className = "task-text";
        taskText.textContent = task.text;

        taskMeta.className = "task-meta";

        categoryBadge.className = "task-badge";
        categoryBadge.textContent =
            `${category.icon} ${category.label}`;

        priorityBadge.className =
            task.priority === "high"
                ? "priority-badge priority-high"
                : "priority-badge";

        priorityBadge.textContent =
            task.priority === "high"
                ? "Prioridad alta"
                : "Normal";

        deleteButton.className = "delete-task";
        deleteButton.type = "button";
        deleteButton.textContent = "Eliminar";

        checkbox.addEventListener("change", function () {
            tasks[index].completed = checkbox.checked;

            saveTasks();
            renderTasks();
        });

        deleteButton.addEventListener("click", function () {
            tasks.splice(index, 1);

            saveTasks();
            renderTasks();
        });

        taskMeta.append(
            categoryBadge,
            priorityBadge
        );

        taskContent.append(
            taskText,
            taskMeta
        );

        taskItem.append(
            checkbox,
            taskContent,
            deleteButton
        );

        taskList.appendChild(taskItem);
    });

    updateProgress();
    updateModuleCounts();
}

function addTask() {
    const text = taskInput.value.trim();

    if (text === "") {
        taskInput.focus();
        return;
    }

    tasks.push({
        text: text,
        completed: false,
        category: taskCategory.value,
        priority: taskPriority.value
    });

    taskInput.value = "";
    taskPriority.value = "normal";
    taskInput.focus();

    saveTasks();
    renderTasks();
}

addTaskButton.addEventListener("click", addTask);

taskInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        addTask();
    }
});

filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
        currentFilter = button.dataset.filter;

        filterButtons.forEach(function (filterButton) {
            filterButton.classList.remove("active");
        });

        button.classList.add("active");
        renderTasks();
    });
});

updateClock();
setInterval(updateClock, 1000);

renderTasks();