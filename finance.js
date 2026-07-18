const transactionForm =
    document.querySelector("#transactionForm");

const descriptionInput =
    document.querySelector("#transactionDescription");

const amountInput =
    document.querySelector("#transactionAmount");

const typeInput =
    document.querySelector("#transactionType");

const transactionList =
    document.querySelector("#transactionList");

const balanceAmount =
    document.querySelector("#balanceAmount");

const incomeAmount =
    document.querySelector("#incomeAmount");

const expenseAmount =
    document.querySelector("#expenseAmount");

function loadTransactions() {
    try {
        return JSON.parse(
            localStorage.getItem("atlasTransactions")
        ) || [];
    } catch (error) {
        console.error(
            "No se pudieron cargar los movimientos:",
            error
        );

        return [];
    }
}

let transactions = loadTransactions();

function saveTransactions() {
    localStorage.setItem(
        "atlasTransactions",
        JSON.stringify(transactions)
    );
}

function formatMoney(amount) {
    return new Intl.NumberFormat("es-PY", {
        style: "currency",
        currency: "PYG",
        maximumFractionDigits: 0
    }).format(amount);
}

function updateFinanceSummary() {
    const totalIncome = transactions
        .filter(function (transaction) {
            return transaction.type === "income";
        })
        .reduce(function (total, transaction) {
            return total + transaction.amount;
        }, 0);

    const totalExpenses = transactions
        .filter(function (transaction) {
            return transaction.type === "expense";
        })
        .reduce(function (total, transaction) {
            return total + transaction.amount;
        }, 0);

    const currentBalance =
        totalIncome - totalExpenses;

    incomeAmount.textContent =
        formatMoney(totalIncome);

    expenseAmount.textContent =
        formatMoney(totalExpenses);

    balanceAmount.textContent =
        formatMoney(currentBalance);

    balanceAmount.classList.toggle(
        "negative-balance",
        currentBalance < 0
    );
}

function deleteTransaction(transactionId) {
    transactions = transactions.filter(
        function (transaction) {
            return transaction.id !== transactionId;
        }
    );

    saveTransactions();
    renderTransactions();
}

function renderTransactions() {
    transactionList.innerHTML = "";

    if (transactions.length === 0) {
        const emptyMessage =
            document.createElement("li");

        emptyMessage.className = "empty-state";

        emptyMessage.textContent =
            "Todavía no registraste movimientos.";

        transactionList.appendChild(emptyMessage);
    }

    transactions
        .slice()
        .reverse()
        .forEach(function (transaction) {
            const transactionItem =
                document.createElement("li");

            const transactionMain =
                document.createElement("div");

            const description =
                document.createElement("strong");

            const transactionDate =
                document.createElement("span");

            const amount =
                document.createElement("span");

            const deleteButton =
                document.createElement("button");

            transactionItem.className =
                "transaction-item";

            transactionMain.className =
                "transaction-main";

            description.textContent =
                transaction.description;

            transactionDate.textContent =
                new Intl.DateTimeFormat("es-PY", {
                    dateStyle: "short",
                    timeStyle: "short"
                }).format(
                    new Date(transaction.createdAt)
                );

            amount.className =
                transaction.type === "income"
                    ? "transaction-amount income-amount"
                    : "transaction-amount expense-amount";

            amount.textContent =
                transaction.type === "income"
                    ? `+ ${formatMoney(transaction.amount)}`
                    : `- ${formatMoney(transaction.amount)}`;

            deleteButton.className = "delete-task";
            deleteButton.type = "button";
            deleteButton.textContent = "Eliminar";

            deleteButton.addEventListener(
                "click",
                function () {
                    deleteTransaction(transaction.id);
                }
            );

            transactionMain.append(
                description,
                transactionDate
            );

            transactionItem.append(
                transactionMain,
                amount,
                deleteButton
            );

            transactionList.appendChild(
                transactionItem
            );
        });

    updateFinanceSummary();
}

transactionForm.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();

        const description =
            descriptionInput.value.trim();

        const amount =
            Number(amountInput.value);

        if (
            description === "" ||
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            return;
        }

        transactions.push({
            id: Date.now(),
            description: description,
            amount: amount,
            type: typeInput.value,
            createdAt: new Date().toISOString()
        });

        saveTransactions();
        renderTransactions();

        transactionForm.reset();
        typeInput.value = "expense";
        descriptionInput.focus();
    }
);

renderTransactions();