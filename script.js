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
const exportButton = document.querySelector("#exportButton");
const importButton = document.querySelector("#importButton");
const importFile = document.querySelector("#importFile");
const backupStatus = document.querySelector("#backupStatus");
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
const quickNotes = document.querySelector("#quickNotes");
const notesStatus = document.querySelector("#notesStatus");
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
function getStoredArray(storageKey) {
    try {
        const storedData = JSON.parse(
            localStorage.getItem(storageKey)
        );

        return Array.isArray(storedData)
            ? storedData
            : [];
    } catch (error) {
        console.error(
            `No se pudo leer ${storageKey}:`,
            error
        );

        return [];
    }
}

function exportData() {
    const backup = {
        version: 2,

        exportedAt:
            new Date().toISOString(),

        data: {
            tasks: tasks,

            notes:
                quickNotes.value,

            transactions:
                getStoredArray(
                    "atlasTransactions"
                ),

            studyEvents:
                getStoredArray(
                    "atlasStudyEvents"
                ),

            healthRecords:
                getStoredArray(
                    "atlasHealthRecords"
                ),

            projects:
                getStoredArray(
                    "atlasProjects"
                ),

            workRecords:
                getStoredArray(
                    "atlasWorkRecords"
                ),

            habits:
                getStoredArray(
                    "atlasHabits"
                )
        }
    };

    const backupContent =
        JSON.stringify(backup, null, 2);

    const backupFile = new Blob(
        [backupContent],
        {
            type: "application/json"
        }
    );

    const downloadUrl =
        URL.createObjectURL(backupFile);

    const downloadLink =
        document.createElement("a");

    const currentDay =
        new Date().toISOString().slice(0, 10);

    downloadLink.href = downloadUrl;

    downloadLink.download =
        `atlas-so-full-backup-${currentDay}.json`;

    document.body.appendChild(downloadLink);

    downloadLink.click();
    downloadLink.remove();

    URL.revokeObjectURL(downloadUrl);

    backupStatus.textContent =
        "Copia completa exportada correctamente.";
}

async function importData(event) {
    const selectedFile =
        event.target.files[0];

    if (!selectedFile) {
        return;
    }

    const confirmed = window.confirm(
        "La importación reemplazará los datos actuales. ¿Querés continuar?"
    );

    if (!confirmed) {
        importFile.value = "";
        return;
    }

    try {
        const fileContent =
            await selectedFile.text();

        const backup =
            JSON.parse(fileContent);

        const backupData =
            backup.data || backup;

        if (!Array.isArray(backupData.tasks)) {
            throw new Error(
                "El archivo no contiene tareas válidas."
            );
        }

        tasks = backupData.tasks
            .map(function (task) {
                return {
                    text:
                        String(
                            task.text || ""
                        ).trim(),

                    completed:
                        Boolean(task.completed),

                    category:
                        categories[task.category]
                            ? task.category
                            : "personal",

                    priority:
                        task.priority === "high"
                            ? "high"
                            : "normal"
                };
            })
            .filter(function (task) {
                return task.text !== "";
            });

        quickNotes.value =
            typeof backupData.notes === "string"
                ? backupData.notes
                : "";

        saveTasks();

        localStorage.setItem(
            "atlasQuickNotes",
            quickNotes.value
        );

        const moduleStorage = [
            {
                property: "transactions",
                key: "atlasTransactions"
            },
            {
                property: "studyEvents",
                key: "atlasStudyEvents"
            },
            {
                property: "healthRecords",
                key: "atlasHealthRecords"
            },
            {
                property: "projects",
                key: "atlasProjects"
            },
            {
                property: "workRecords",
                key: "atlasWorkRecords"
            },
            {
                property: "habits",
                key: "atlasHabits"
            }
        ];

        moduleStorage.forEach(function (module) {
            const moduleData =
                backupData[module.property];

            if (Array.isArray(moduleData)) {
                localStorage.setItem(
                    module.key,
                    JSON.stringify(moduleData)
                );
            }
        });

        notesStatus.textContent =
            "Guardado";

        backupStatus.textContent =
            "Todos los datos fueron restaurados.";

        renderTasks();
    } catch (error) {
        console.error(error);

        backupStatus.textContent =
            "El archivo no es una copia válida de ATLAS SO.";
    }

    importFile.value = "";
}

exportButton.addEventListener("click", exportData);

importButton.addEventListener("click", function () {
    importFile.click();
});

importFile.addEventListener("change", importData);
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
let notesSaveTimer;

quickNotes.value =
    localStorage.getItem("atlasQuickNotes") || "";

quickNotes.addEventListener("input", function () {
    notesStatus.textContent = "Guardando...";

    clearTimeout(notesSaveTimer);

    notesSaveTimer = setTimeout(function () {
        localStorage.setItem(
            "atlasQuickNotes",
            quickNotes.value
        );

        notesStatus.textContent = "Guardado";
    }, 400);
});
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