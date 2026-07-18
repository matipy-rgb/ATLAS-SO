const currentDate = document.querySelector("#currentDate");
const progressText = document.querySelector("#progressText");
const progressBar = document.querySelector("#progressBar");
const statusMessage = document.querySelector("#statusMessage");
const completeButton = document.querySelector("#completeButton");

let progress = 0;

currentDate.textContent = new Intl.DateTimeFormat("es-PY", {
    dateStyle: "full"
}).format(new Date());

completeButton.addEventListener("click", function () {
    progress = Math.min(progress + 20, 100);

    progressText.textContent = `${progress}%`;
    progressBar.style.width = `${progress}%`;

    if (progress === 100) {
        statusMessage.textContent = "Objetivo diario completado.";
        completeButton.textContent = "Día completado";
        completeButton.disabled = true;
    } else {
        statusMessage.textContent = "Buen trabajo. Sigamos avanzando.";
    }
});
const taskInput = document.querySelector("#taskInput");
const addTaskButton = document.querySelector("#addTaskButton");
const taskList = document.querySelector("#taskList");

function addTask() {
    const taskText = taskInput.value.trim();

    if (taskText === "") {
        return;
    }

    const taskItem = document.createElement("li");

    taskItem.textContent = taskText;
    taskList.appendChild(taskItem);

    taskInput.value = "";
    taskInput.focus();
}

addTaskButton.addEventListener("click", addTask);

taskInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        addTask();
    }
});