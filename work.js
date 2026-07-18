const workForm =
    document.querySelector("#workForm");

const workDate =
    document.querySelector("#workDate");

const workDescription =
    document.querySelector("#workDescription");

const workHours =
    document.querySelector("#workHours");

const hourlyRate =
    document.querySelector("#hourlyRate");

const discountPercent =
    document.querySelector("#discountPercent");

const workMonthFilter =
    document.querySelector("#workMonthFilter");

const workRecordList =
    document.querySelector("#workRecordList");

const totalWorkHours =
    document.querySelector("#totalWorkHours");

const totalGross =
    document.querySelector("#totalGross");

const totalDiscount =
    document.querySelector("#totalDiscount");

const totalNet =
    document.querySelector("#totalNet");

function getLocalToday() {
    const now = new Date();

    const localDate = new Date(
        now.getTime() -
        now.getTimezoneOffset() * 60000
    );

    return localDate.toISOString().slice(0, 10);
}

function formatMoney(amount) {
    return new Intl.NumberFormat("es-PY", {
        style: "currency",
        currency: "PYG",
        maximumFractionDigits: 0
    }).format(amount);
}

function parseLocalDate(dateValue) {
    const parts = dateValue
        .split("-")
        .map(Number);

    return new Date(
        parts[0],
        parts[1] - 1,
        parts[2]
    );
}

function formatDate(dateValue) {
    return new Intl.DateTimeFormat("es-PY", {
        dateStyle: "medium"
    }).format(parseLocalDate(dateValue));
}

function loadWorkRecords() {
    try {
        return JSON.parse(
            localStorage.getItem("atlasWorkRecords")
        ) || [];
    } catch (error) {
        console.error(
            "No se cargaron las jornadas:",
            error
        );

        return [];
    }
}

let workRecords = loadWorkRecords();

function saveWorkRecords() {
    localStorage.setItem(
        "atlasWorkRecords",
        JSON.stringify(workRecords)
    );
}

function calculateRecord(record) {
    const gross = record.hours * record.rate;

    const discount =
        gross * (record.discountPercent / 100);

    const net = gross - discount;

    return {
        gross: gross,
        discount: discount,
        net: net
    };
}

function getVisibleWorkRecords() {
    const selectedMonth =
        workMonthFilter.value;

    if (selectedMonth === "") {
        return workRecords;
    }

    return workRecords.filter(
        function (record) {
            return record.date.startsWith(
                selectedMonth
            );
        }
    );
}

function updateWorkSummary(records) {
    const summary = records.reduce(
        function (total, record) {
            const calculation =
                calculateRecord(record);

            total.hours += record.hours;
            total.gross += calculation.gross;
            total.discount += calculation.discount;
            total.net += calculation.net;

            return total;
        },
        {
            hours: 0,
            gross: 0,
            discount: 0,
            net: 0
        }
    );

    totalWorkHours.textContent =
        `${summary.hours.toLocaleString("es-PY", {
            maximumFractionDigits: 2
        })} h`;

    totalGross.textContent =
        formatMoney(summary.gross);

    totalDiscount.textContent =
        formatMoney(summary.discount);

    totalNet.textContent =
        formatMoney(summary.net);
}

function deleteWorkRecord(recordId) {
    workRecords = workRecords.filter(
        function (record) {
            return record.id !== recordId;
        }
    );

    saveWorkRecords();
    renderWorkRecords();
}

function renderWorkRecords() {
    workRecordList.innerHTML = "";

    const visibleRecords =
        getVisibleWorkRecords()
            .slice()
            .sort(function (firstRecord, secondRecord) {
                return secondRecord.date.localeCompare(
                    firstRecord.date
                );
            });

    if (visibleRecords.length === 0) {
        const emptyMessage =
            document.createElement("li");

        emptyMessage.className = "empty-state";

        emptyMessage.textContent =
            "No hay jornadas registradas en este mes.";

        workRecordList.appendChild(emptyMessage);
    }

    visibleRecords.forEach(function (record) {
        const calculation =
            calculateRecord(record);

        const recordItem =
            document.createElement("li");

        const recordContent =
            document.createElement("div");

        const recordTitle =
            document.createElement("strong");

        const recordMeta =
            document.createElement("div");

        const dateBadge =
            document.createElement("span");

        const hoursBadge =
            document.createElement("span");

        const rateBadge =
            document.createElement("span");

        const amounts =
            document.createElement("div");

        const grossAmount =
            document.createElement("span");

        const netAmount =
            document.createElement("strong");

        const deleteButton =
            document.createElement("button");

        recordItem.className = "work-record";

        recordContent.className =
            "work-record-content";

        recordTitle.textContent =
            record.description;

        recordMeta.className =
            "work-record-meta";

        dateBadge.className = "work-badge";
        hoursBadge.className = "work-badge";
        rateBadge.className = "work-badge";

        dateBadge.textContent =
            formatDate(record.date);

        hoursBadge.textContent =
            `${record.hours} horas`;

        rateBadge.textContent =
            `${formatMoney(record.rate)} por hora`;

        amounts.className =
            "work-record-amounts";

        grossAmount.textContent =
            `Bruto: ${formatMoney(calculation.gross)}`;

        netAmount.textContent =
            `Neto: ${formatMoney(calculation.net)}`;

        deleteButton.className = "delete-task";
        deleteButton.type = "button";
        deleteButton.textContent = "Eliminar";

        deleteButton.addEventListener(
            "click",
            function () {
                deleteWorkRecord(record.id);
            }
        );

        recordMeta.append(
            dateBadge,
            hoursBadge,
            rateBadge
        );

        recordContent.append(
            recordTitle,
            recordMeta
        );

        amounts.append(
            grossAmount,
            netAmount
        );

        recordItem.append(
            recordContent,
            amounts,
            deleteButton
        );

        workRecordList.appendChild(recordItem);
    });

    updateWorkSummary(visibleRecords);
}

workForm.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const record = {
            id: Date.now(),
            date: workDate.value,
            description:
                workDescription.value.trim(),
            hours: Number(workHours.value),
            rate: Number(hourlyRate.value),
            discountPercent:
                Number(discountPercent.value),
            createdAt:
                new Date().toISOString()
        };

        if (
            record.description === "" ||
            record.hours <= 0 ||
            record.rate <= 0 ||
            record.discountPercent < 0
        ) {
            return;
        }

        workRecords.push(record);

        saveWorkRecords();
        renderWorkRecords();

        workForm.reset();

        workDate.value = getLocalToday();
        hourlyRate.value = 14635;
        discountPercent.value = 9;

        workDescription.focus();
    }
);

workMonthFilter.addEventListener(
    "change",
    renderWorkRecords
);

workDate.value = getLocalToday();

workMonthFilter.value =
    getLocalToday().slice(0, 7);

renderWorkRecords();