const projectForm =
    document.querySelector("#projectForm");

const projectName =
    document.querySelector("#projectName");

const projectNextStep =
    document.querySelector("#projectNextStep");

const projectProgress =
    document.querySelector("#projectProgress");

const projectStatus =
    document.querySelector("#projectStatus");

const projectSubmitButton =
    document.querySelector("#projectSubmitButton");

const cancelProjectEdit =
    document.querySelector("#cancelProjectEdit");

const projectFormSection =
    document.querySelector("#projectFormSection");

const projectList =
    document.querySelector("#projectList");

const totalProjects =
    document.querySelector("#totalProjects");

const activeProjects =
    document.querySelector("#activeProjects");

const completedProjects =
    document.querySelector("#completedProjects");

const averageProgress =
    document.querySelector("#averageProgress");

const statusLabels = {
    active: "Activo",
    paused: "Pausado",
    completed: "Completado"
};

function loadProjects() {
    try {
        return JSON.parse(
            localStorage.getItem("atlasProjects")
        ) || [];
    } catch (error) {
        console.error(
            "No se pudieron cargar los proyectos:",
            error
        );

        return [];
    }
}

let projects = loadProjects();
let editingProjectId = null;

function saveProjects() {
    localStorage.setItem(
        "atlasProjects",
        JSON.stringify(projects)
    );
}

function updateProjectSummary() {
    const activeCount = projects.filter(
        function (project) {
            return project.status === "active";
        }
    ).length;

    const completedCount = projects.filter(
        function (project) {
            return project.status === "completed";
        }
    ).length;

    const totalProgress = projects.reduce(
        function (total, project) {
            return total + project.progress;
        },
        0
    );

    const progressAverage = projects.length === 0
        ? 0
        : Math.round(totalProgress / projects.length);

    totalProjects.textContent = projects.length;
    activeProjects.textContent = activeCount;
    completedProjects.textContent = completedCount;
    averageProgress.textContent = `${progressAverage}%`;
}

function resetProjectForm() {
    editingProjectId = null;

    projectForm.reset();

    projectProgress.value = 0;
    projectStatus.value = "active";

    projectSubmitButton.textContent = "Agregar";
    cancelProjectEdit.hidden = true;

    projectName.focus();
}

function startProjectEdit(projectId) {
    const project = projects.find(
        function (projectItem) {
            return projectItem.id === projectId;
        }
    );

    if (!project) {
        return;
    }

    editingProjectId = project.id;

    projectName.value = project.name;
    projectNextStep.value = project.nextStep;
    projectProgress.value = project.progress;
    projectStatus.value = project.status;

    projectSubmitButton.textContent =
        "Guardar cambios";

    cancelProjectEdit.hidden = false;

    projectFormSection.scrollIntoView({
        behavior: "smooth"
    });

    projectName.focus();
}

function deleteProject(projectId) {
    const confirmed = window.confirm(
        "¿Querés eliminar este proyecto?"
    );

    if (!confirmed) {
        return;
    }

    projects = projects.filter(
        function (project) {
            return project.id !== projectId;
        }
    );

    if (editingProjectId === projectId) {
        resetProjectForm();
    }

    saveProjects();
    renderProjects();
}

function renderProjects() {
    projectList.innerHTML = "";

    const orderedProjects = projects
        .slice()
        .sort(function (firstProject, secondProject) {
            if (
                firstProject.status === "completed" &&
                secondProject.status !== "completed"
            ) {
                return 1;
            }

            if (
                firstProject.status !== "completed" &&
                secondProject.status === "completed"
            ) {
                return -1;
            }

            return firstProject.name.localeCompare(
                secondProject.name
            );
        });

    if (orderedProjects.length === 0) {
        const emptyMessage =
            document.createElement("li");

        emptyMessage.className = "empty-state";

        emptyMessage.textContent =
            "Todavía no registraste proyectos.";

        projectList.appendChild(emptyMessage);
    }

    orderedProjects.forEach(function (project) {
        const projectItem =
            document.createElement("li");

        const projectHeader =
            document.createElement("div");

        const name =
            document.createElement("h3");

        const statusBadge =
            document.createElement("span");

        const nextStep =
            document.createElement("p");

        const progressHeading =
            document.createElement("div");

        const progressLabel =
            document.createElement("span");

        const progressValue =
            document.createElement("strong");

        const progressTrack =
            document.createElement("div");

        const progressFill =
            document.createElement("div");

        const actions =
            document.createElement("div");

        const editButton =
            document.createElement("button");

        const deleteButton =
            document.createElement("button");

        projectItem.className =
            "project-item";

        projectHeader.className =
            "project-item-header";

        name.textContent = project.name;

        statusBadge.className =
            `project-status ${project.status}`;

        statusBadge.textContent =
            statusLabels[project.status];

        nextStep.className = "project-next-step";

        nextStep.textContent =
            `Próximo paso: ${project.nextStep}`;

        progressHeading.className =
            "project-progress-heading";

        progressLabel.textContent = "Progreso";
        progressValue.textContent =
            `${project.progress}%`;

        progressTrack.className =
            "project-progress-track";

        progressFill.className =
            "project-progress-fill";

        progressFill.style.width =
            `${project.progress}%`;

        actions.className =
            "project-actions";

        editButton.className = "edit-button";
        editButton.type = "button";
        editButton.textContent = "Editar";

        deleteButton.className = "delete-task";
        deleteButton.type = "button";
        deleteButton.textContent = "Eliminar";

        editButton.addEventListener(
            "click",
            function () {
                startProjectEdit(project.id);
            }
        );

        deleteButton.addEventListener(
            "click",
            function () {
                deleteProject(project.id);
            }
        );

        projectHeader.append(
            name,
            statusBadge
        );

        progressHeading.append(
            progressLabel,
            progressValue
        );

        progressTrack.appendChild(progressFill);

        actions.append(
            editButton,
            deleteButton
        );

        projectItem.append(
            projectHeader,
            nextStep,
            progressHeading,
            progressTrack,
            actions
        );

        projectList.appendChild(projectItem);
    });

    updateProjectSummary();
}

projectForm.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const name = projectName.value.trim();

        const nextStep =
            projectNextStep.value.trim();

        let progress =
            Number(projectProgress.value);

        let status = projectStatus.value;

        progress = Math.max(
            0,
            Math.min(progress, 100)
        );

        if (progress === 100) {
            status = "completed";
        }

        if (status === "completed") {
            progress = 100;
        }

        const projectData = {
            name: name,
            nextStep: nextStep,
            progress: progress,
            status: status
        };

        if (editingProjectId !== null) {
            projects = projects.map(
                function (project) {
                    if (
                        project.id ===
                        editingProjectId
                    ) {
                        return {
                            ...project,
                            ...projectData
                        };
                    }

                    return project;
                }
            );
        } else {
            projects.push({
                id: Date.now(),
                createdAt:
                    new Date().toISOString(),
                ...projectData
            });
        }

        saveProjects();
        renderProjects();
        resetProjectForm();
    }
);

cancelProjectEdit.addEventListener(
    "click",
    resetProjectForm
);

renderProjects();