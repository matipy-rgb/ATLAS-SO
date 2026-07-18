const currentDate = document.querySelector("#currentDate");
const progressText = document.querySelector("#progressText");
const progressBar = document.querySelector("#progressBar");
const statusMessage = document.querySelector("#statusMessage");

const taskInput = document.querySelector("#taskInput");
const addTaskButton = document.querySelector("#addTaskButton");
const taskList = document.querySelector("#taskList");

let tasks = JSON.parse(localStorage.getItem("atlasTasks")) || [];

currentDate.textContent = new Intl.DateTimeFormat("es-PY", {
    dateStyle: "full"
}).format(new Date());

function saveTasks() {
    localStorage.setItem("atlasTasks", JSON.stringify(tasks));
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
        statusMessage.textContent = "Todavía no agregaste tareas.";
    } else if (progress === 100) {
        statusMessage.textContent = "Objetivo diario completado.";
    } else {
        statusMessage.textContent =
            `${completedTasks} de ${totalTasks} tareas completadas.`;
    }
}

function renderTasks() {
    taskList.innerHTML = "";

    tasks.forEach(function (task, index) {
        const taskItem = document.createElement("li");
        const checkbox = document.createElement("input");
        const taskText = document.createElement("span");
        const deleteButton = document.createElement("button");

        taskItem.className = task.completed
            ? "task-item completed"
            : "task-item";

        checkbox.type = "checkbox";
        checkbox.checked = task.completed;

        taskText.textContent = task.text;

        deleteButton.textContent = "Eliminar";
        deleteButton.className = "delete-task";

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

        taskItem.append(checkbox, taskText, deleteButton);
        taskList.appendChild(taskItem);
    });

    updateProgress();
}

function addTask() {
    const taskText = taskInput.value.trim();

    if (taskText === "") {
        return;
    }

    tasks.push({
        text: taskText,
        completed: false
    });

    taskInput.value = "";
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

renderTasks();