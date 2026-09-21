import {
    TIMESHEET_STORE_NAME,
    FAVORITES_STORE_NAME,
    YEAR_WEEK_INDEX_NAME,
    PROJECT_ID_INDEX_NAME,
    IMPORTABLE_STORES
} from "./config.js";
import {
    deleteRow,
    loadRows,
    saveRow,
    createTimesheetRow
} from "./tools/db-tools.js";
import { openModalWindow } from "./tools/window-manager.js";
import {
    ensureTrailingEmptyRow,
    deleteRowButtonFormatter,
    formatNumberOrBlank,
    rowHasContent,
    saveEditedRowAndAppendEmptyRow
} from "./tools/tabulator-tools.js";
import {
    formatDateDMY,
    getCurrentYearAndWeekFromDate,
    getISOWeekDates
} from "./tools/date-tools.js";

let timesheetTable = null;
let year;
let week;
let overlay = null;

export async function initTimesheet({ overlay: overlayElement } = {}) {
    overlay = overlayElement ?? overlay;

    await loadTimesheetParameters();
    await loadTimesheetTables();
}

export function getTimesheetYearWeek() {
    if (year === undefined || week === undefined) {
        return null;
    }

    return { year, week };
}

export async function insertTimesheetFavorites({ overlay: overlayElement } = {}) {
    overlay = overlayElement ?? overlay;

    if (!timesheetTable) {
        await initTimesheet({ overlay });
    }

    const favorites = await loadRows(FAVORITES_STORE_NAME, PROJECT_ID_INDEX_NAME);
    const currentRows = timesheetTable.getData().filter(
        row => rowHasContent(row) && !isTimesheetPlaceholderRow(row)
    );

    const rowsToInsert = [];

    for (const favorite of favorites) {
        const projectId = normalizeText(favorite.projectId);
        const projectName = normalizeText(favorite.projectName);

        if (projectId === "" && projectName === "") {
            continue;
        }

        const row = {
            ...createTimesheetRow(year, week, "", ""),
            projectId: favorite.projectId ?? "",
            projectName: favorite.projectName ?? ""
        };

        row.id = await saveRow(TIMESHEET_STORE_NAME, row);
        rowsToInsert.push(row);
    }

    if (rowsToInsert.length === 0) {
        return;
    }

    const updatedRows = ensureTrailingEmptyRow(
        [...currentRows, ...rowsToInsert],
        () => createTimesheetRow(year, week, "", "")
    );

    await timesheetTable.replaceData(updatedRows);
}

async function loadTimesheetParameters() {
    document.getElementById("logoContainer").style.display = "none";
    document.getElementById("timeTable").style.display = "block";

    const now = new Date();
    ({ year, week } = getCurrentYearAndWeekFromDate(now));
}

async function loadTimesheetTables() {
    if (timesheetTable) {
        timesheetTable.destroy();
    }

    let timesheetRows = await loadRows(TIMESHEET_STORE_NAME, YEAR_WEEK_INDEX_NAME, year, week);
    timesheetRows = ensureTrailingEmptyRow(timesheetRows, () => createTimesheetRow(year, week, "", ""));

    timesheetTable = new Tabulator("#timeTable", {
        index: "id",
        layout: "fitColumns",
        height: "100%",
        data: timesheetRows,
        columns: createTimesheetColumns(year, week)
    });

    timesheetTable.on("cellEdited", async cell => {
        const row = cell.getRow();
        const data = row.getData();

        const totalHours = calculateTotalHours(data);
        row.update({ totalHours });
        data.totalHours = totalHours;

        await saveEditedRowAndAppendEmptyRow({
            row,
            data,
            table: timesheetTable,
            createEmptyRow: () => createTimesheetRow(year, week, "", ""),
            saveRowFn: rowData => saveRow(TIMESHEET_STORE_NAME, rowData)
        });
    });
}

function createTimesheetColumns(currentYear, currentWeek) {
    const days = getISOWeekDates(currentYear, currentWeek);

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
                        await deleteRow(TIMESHEET_STORE_NAME, data.id);
                    }

                    let rows = await loadRows(TIMESHEET_STORE_NAME, YEAR_WEEK_INDEX_NAME, year, week);

                    timesheetTable.replaceData(
                        ensureTrailingEmptyRow(rows, () => createTimesheetRow(year, week, "", ""))
                    );
                } catch (error) {
                    console.error("Failed to delete row:", error);
                }
            }
        },
        {
            title: "",
            headerHozAlign: "center",
            titleFormatter: () => `
                <div class="week-header">
                    <span class="week-hover week-prev" aria-label="Previous week">&#9664;</span>
                    <span class="week-hover week-title">Week ${week} - ${year}</span>
                    <span class="week-hover week-next" aria-label="Next week">&#9654;</span>
                </div>
            `,
            headerClick: event => {
                if (event.target.classList.contains("week-prev")) {
                    changeWeek(-1);
                } else if (event.target.classList.contains("week-next")) {
                    changeWeek(1);
                } else if (event.target.classList.contains("week-title")) {
                    changeDate();
                }
            },
            columns: [
                { title: "Project", field: "projectId", editor: "input", widthGrow: 1.5, minWidth: 90 },
                { title: "Name", field: "projectName", editor: "input", widthGrow: 1.5, minWidth: 90 }
            ]
        },
        dayColumn(`Monday (${formatDateDMY(days[0])})`, "monday"),
        dayColumn(`Tuesday (${formatDateDMY(days[1])})`, "tuesday"),
        dayColumn(`Wednesday (${formatDateDMY(days[2])})`, "wednesday"),
        dayColumn(`Thursday (${formatDateDMY(days[3])})`, "thursday"),
        dayColumn(`Friday (${formatDateDMY(days[4])})`, "friday"),
        dayColumn(`Saturday (${formatDateDMY(days[5])})`, "saturday"),
        dayColumn(`Sunday (${formatDateDMY(days[6])})`, "sunday"),
        {
            title: "Totals",
            headerHozAlign: "center",
            columns: [
                {
                    title: "Hours",
                    field: "totalHours",
                    widthGrow: 1,
                    minWidth: 60,
                    hozAlign: "right",
                    editable: false,
                    formatter: cell => formatNumberOrBlank(calculateTotalHours(cell.getRow().getData())),
                    bottomCalc: calculateTimesheetTotal,
                    bottomCalcFormatter: formatNumberOrBlank
                }
            ]
        }
    ];
}

function dayColumn(title, field) {
    return {
        title,
        headerHozAlign: "center",
        columns: [
            {
                title: "Hours",
                field: `${field}Hours`,
                editor: "number",
                widthGrow: 1,
                minWidth: 60,
                hozAlign: "right",
                editorParams: {
                    step: 0.25
                },
                mutator: formatNumberOrBlank,
                bottomCalc: "sum",
                bottomCalcFormatter: formatNumberOrBlank
            },
            {
                title: "Description",
                field: `${field}Desc`,
                editor: "input",
                widthGrow: 2,
                minWidth: 120
            }
        ]
    };
}

function calculateTotalHours(data) {
    const fields = IMPORTABLE_STORES.workWeek;

    return fields.reduce((sum, field) => {
        const value = Number(data[field]);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
}

function calculateTimesheetTotal(values, data) {
    return data.reduce((sum, row) => sum + calculateTotalHours(row), 0);
}

function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function isTimesheetPlaceholderRow(row) {
    const fieldsToCheck = IMPORTABLE_STORES.timesheet.filter(field => !["year", "week"].includes(field));

    return fieldsToCheck.every(field => isEmptyText(row[field]));
}

function isEmptyText(value) {
    return value === "" || value === null || value === undefined;
}

async function changeWeek(delta) {
    const monday = getISOWeekDates(year, week)[0];
    monday.setDate(monday.getDate() + delta * 7);

    ({ year, week } = getCurrentYearAndWeekFromDate(monday));

    let rows = await loadRows(TIMESHEET_STORE_NAME, YEAR_WEEK_INDEX_NAME, year, week);

    rows = ensureTrailingEmptyRow(rows, () => createTimesheetRow(year, week, "", ""));

    timesheetTable.setColumns(createTimesheetColumns(year, week));
    timesheetTable.replaceData(rows);
}

function changeDate() {
    openModalWindow("calendar", {
        overlay,
        title: "Select date",
        parameters: `year=${year}&week=${week}`,
        width: "500",
        height: "330",
        onEvent: message => {
            if (message.type !== "dateSelected") {
                return;
            }

            const [selectedYear, selectedMonth, selectedDay] = message.date.split("-").map(Number);
            const parsedDate = new Date(selectedYear, selectedMonth - 1, selectedDay);

            ({ year, week } = getCurrentYearAndWeekFromDate(parsedDate));
            changeWeek(0);
        }
    });
}
