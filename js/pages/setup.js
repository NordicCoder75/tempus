import {
    SETUP_STORE_NAME,
    WORK_WEEK_STORE_NAME,
    FAVORITES_STORE_NAME,
    PROJECT_ID_INDEX_NAME,
    DAYS_IN_WEEK,
    DEFAULT_WORK_WEEK_HOURS, TIME_SHIFTS
} from "../config.js";
import {
    initDatabase,
    loadRows,
    saveRow,
    deleteRow
} from "../tools/db-tools.js";
import {
    ensureTrailingEmptyRow,
    deleteRowButtonFormatter,
    formatNumberOrBlank,
    saveEditedRowAndAppendEmptyRow
} from "../tools/tabulator-tools.js";
import { capitalizeText } from "../tools/text-tools.js";

let setupParameters;
let workWeekTable;
let favoritesTable;

initSetup().catch(error => {
    console.error("Failed to initialize setup:", error);
});

async function initSetup() {
    await initDatabase();

    await loadSetupParameters();
    await loadSetupTables();
}

async function loadSetupParameters() {
    const rows = await loadRows(SETUP_STORE_NAME);

    if (rows.length === 0) {
        setupParameters = createEmptySetupRow();
        setupParameters.id = await saveRow(SETUP_STORE_NAME, setupParameters);
    } else {
        setupParameters = rows[0];
    }

    populateSelect("internalTimeShift", TIME_SHIFTS, setupParameters.internalTimeShift ?? "");
    populateSelect("projectTimeShift", TIME_SHIFTS, setupParameters.projectTimeShift ?? "");
    populateInput("employeeId", setupParameters.employeeId);
}

async function loadSetupTables() {
    let workWeekRows = await loadRows(WORK_WEEK_STORE_NAME);
    let favoritesRows = await loadRows(FAVORITES_STORE_NAME, PROJECT_ID_INDEX_NAME);

    if (workWeekRows.length === 0) {
        workWeekRows = [createEmptyWorkweekRow()];
    }

    favoritesRows = ensureTrailingEmptyRow(favoritesRows, createEmptyFavoritesRow);

    workWeekTable = new Tabulator("#workWeekTable", {
        index: "id",
        layout: "fitColumns",
        width: "100%",
        height: "50px",
        data: workWeekRows,
        columns: createWorkWeekColumns()
    });

    favoritesTable = new Tabulator("#favoritesTable", {
        index: "id",
        layout: "fitColumns",
        width: "100%",
        height: "100%",
        data: favoritesRows,
        columns: createFavoritesColumns()
    });

    workWeekTable.on("cellEdited", async cell => {
        const row = cell.getRow();
        const data = row.getData();

        await saveEditedRowAndAppendEmptyRow({
            row,
            data,
            table: workWeekTable,
            createEmptyRow: createEmptyWorkweekRow,
            saveRowFn: rowData => saveRow(WORK_WEEK_STORE_NAME, rowData)
        });
    });

    favoritesTable.on("cellEdited", async cell => {
        const row = cell.getRow();
        const data = row.getData();

        await saveEditedRowAndAppendEmptyRow({
            row,
            data,
            table: favoritesTable,
            createEmptyRow: createEmptyFavoritesRow,
            saveRowFn: rowData => saveRow(FAVORITES_STORE_NAME, rowData)
        });
    });
}

function createEmptySetupRow() {
    return {
        employeeId: "",
        internalTimeShift: "",
        projectTimeShift: ""
    };
}

// returns { mondayHours: 7.4, tuesdayHours: 7.4, ... }
function createEmptyWorkweekRow() {
    return Object.fromEntries(
        DAYS_IN_WEEK.map((day, index) => [`${day}Hours`, DEFAULT_WORK_WEEK_HOURS[index]])
    );
}

function createEmptyFavoritesRow() {
    return {
        projectId: "",
        projectName: ""
    };
}

// returns [ hourColumn("Monday"), hourColumn("Tuesday"), ... ]
function createWorkWeekColumns() {
    return DAYS_IN_WEEK.map((day) => hourColumn(day));
}

function createFavoritesColumns() {
    return [
        {
            title: "",
            formatter: deleteRowButtonFormatter,
            width: 40,
            minWidth: 40,
            maxWidth: 40,
            hozAlign: "center",
            headerSort: false,
            cellClick: async (_, cell) => {
                const data = cell.getRow().getData();

                try {
                    if (data.id) {
                        await deleteRow(FAVORITES_STORE_NAME, data.id);
                    }

                    let rows = await loadRows(FAVORITES_STORE_NAME, PROJECT_ID_INDEX_NAME);

                    favoritesTable.replaceData(
                        ensureTrailingEmptyRow(rows, createEmptyFavoritesRow)
                    );
                } catch (error) {
                    console.error("Failed to delete row:", error);
                }
            }
        },
        { title: "Project", field: "projectId", editor: "input", widthGrow: 1 },
        { title: "Name", field: "projectName", editor: "input", widthGrow: 3 }
    ];
}

function hourColumn(weekday) {
    return {
        title: capitalizeText(weekday),
        field: `${weekday}Hours`,
        editor: "number",
        widthGrow: 1,
        minWidth: 60,
        hozAlign: "right",
        editorParams: {
            step: 0.25,
            min: 0,
            max: 24
        },
        validator: [
            "numeric",
            { type: "min", parameters: 0 },
            { type: "max", parameters: 24 }
        ],
        mutator: formatNumberOrBlank
    };
}

function populateSelect(selectId, options, selectedValue) {
    const select = document.getElementById(selectId);

    select.replaceChildren();

    options.forEach(value => {
        const option = new Option(value, value);
        select.appendChild(option);
    });

    select.value = selectedValue ?? "";
    select.addEventListener("change", saveSetupParameters);
}

function populateInput(inputId, selectedValue) {
    const input = document.getElementById(inputId);

    input.value = selectedValue ?? "";
    input.addEventListener("change", saveSetupParameters);
}

async function saveSetupParameters() {
    setupParameters.employeeId = document.getElementById("employeeId").value;
    setupParameters.internalTimeShift = document.getElementById("internalTimeShift").value;
    setupParameters.projectTimeShift = document.getElementById("projectTimeShift").value;

    await saveRow(SETUP_STORE_NAME, setupParameters);
}
