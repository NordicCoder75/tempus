import {
    DAYS_IN_WEEK,
    DEFAULT_WORK_WEEK_HOURS,
    FAVORITES_STORE_NAME,
    IMPORTABLE_STORES,
    MONTHS_IN_YEAR,
    TIMESHEET_STORE_NAME,
    WORK_WEEK_STORE_NAME
} from "../config.js";
import {initDatabase, loadRows} from "../tools/db-tools.js";
import {getISOWeekDates} from "../tools/date-tools.js";
import {capitalizeText} from "../tools/text-tools.js";

const EMPTY_PROJECT_ID = "(empty)";
const EMPTY_PROJECT_NAME = "Leave & Holidays";

const MONTH_TITLES = MONTHS_IN_YEAR.map(capitalizeText);
const MONTH_FIELDS = MONTHS_IN_YEAR.map(month => `${month}Hours`);

let reportTable;
let reportRows = [];
let workWeekHours;

initReport().catch(error => {
    console.error("Failed to initialize report:", error);
});

async function initReport() {
    await initDatabase();

    workWeekHours = await loadWorkWeekHours();

    reportRows = await loadRows(TIMESHEET_STORE_NAME);

    const yearSelect = document.getElementById("reportYear");
    populateYearSelect(yearSelect, reportRows);

    yearSelect.addEventListener("change", async () => {
        await refreshReport(Number(yearSelect.value));
    });

    await refreshReport(Number(yearSelect.value));
}

function populateYearSelect(select, rows) {
    const currentYear = new Date().getFullYear();

    const years = new Set([currentYear]);

    rows.forEach(row => {
        const year = Number(row.year);
        if (Number.isInteger(year) && year > 0) {
            years.add(year);
        }
    });

    const sortedYears = [...years].sort((a, b) => b - a);

    select.replaceChildren();

    sortedYears.forEach(year => {
        select.appendChild(new Option(String(year), String(year)));
    });

    select.value = String(currentYear);
}

async function refreshReport(year) {
    const data = await buildReport(year);

    if (!reportTable) {
        reportTable = new Tabulator("#reportTable", {
            layout: "fitColumns",
            height: "100%",
            data,
            columns: createReportColumns()
        });
        return;
    }

    await reportTable.replaceData(data);
}

async function buildReport(reportYear) {
    const favorites = await loadRows(FAVORITES_STORE_NAME);
    const favoriteNames = new Map(
        favorites
            .filter(row => row.projectId)
            .map(row => [String(row.projectId), row.projectName ?? ""])
    );

    const projectMap = new Map();

    reportRows.forEach(row => {
        const projectId = normalizeProjectId(row.projectId);

        if (!projectMap.has(projectId)) {
            projectMap.set(projectId, createProjectRow(projectId));
        }

        const project = projectMap.get(projectId);

        if (projectId === EMPTY_PROJECT_ID) {
            project.projectName = EMPTY_PROJECT_NAME;
        } else if (hasText(row.projectName)) {
            project.projectName = row.projectName.trim();
        }

        const dates = getISOWeekDates(Number(row.year), Number(row.week));

        dates.forEach((date, index) => {
            if (date.getFullYear() !== reportYear) {
                return;
            }

            const hours = toNumber(row[IMPORTABLE_STORES.workWeek[index]]);
            if (hours === 0) {
                return;
            }

            project[MONTH_FIELDS[date.getMonth()]] += hours;
            project.total += hours;
        });
    });

    return [...projectMap.values()]
        .filter(row => row.total !== 0)
        .map(row => {
            if (!hasText(row.projectName) && row.projectId !== EMPTY_PROJECT_ID) {
                row.projectName = favoriteNames.get(row.projectId) ?? "";
            }

            return roundRow(row);
        })
        .sort((a, b) => a.projectId.localeCompare(b.projectId, undefined, {
            numeric: true,
            sensitivity: "base"
        }));
}

function createProjectRow(projectId) {
    return {
        projectId,
        projectName: projectId === EMPTY_PROJECT_ID ? EMPTY_PROJECT_NAME : "",
        ...Object.fromEntries(MONTHS_IN_YEAR.map(month => [`${month}Hours`, 0])),
        total: 0
    };
}

function createReportColumns() {
    return [
        {
            title: "Project",
            columns: [
                {
                    title: "ID",
                    field: "projectId",
                    minWidth: 110,
                    widthGrow: 1
                },
                {
                    title: "Name",
                    field: "projectName",
                    minWidth: 180,
                    widthGrow: 1.5
                }
            ]
        },
        ...MONTH_TITLES.map((title, index) => hourColumn(title, MONTH_FIELDS[index])),
        hourColumn("Total", "total", true)
    ];
}

function hourColumn(title, field, isTotal = false) {
    return {
        title,
        field,
        minWidth: 80,
        widthGrow: 1,
        hozAlign: "center",
        headerHozAlign: "center",

        formatter: formatHours,

        bottomCalc: (values, data) => {
            return calculateMonthlyTotal(field, data);
        },

        bottomCalcFormatter: (cell) => {
            const value = cell.getValue();

            return `
                <div class="report-total-hours">
                    ${value.projectHours.toFixed(2)} / ${value.availableHours.toFixed(2)}
                </div>
                <div class="report-total-percentage">
                    (${value.percentage.toFixed(0)}%)
                </div>
            `;
        }
    };
}

function calculateMonthlyTotal(field, data) {
    const projectHours = data
        .filter(row => row.projectId !== EMPTY_PROJECT_ID)
        .reduce((sum, row) => sum + (Number(row[field]) || 0), 0);

    const emptyHours = data
        .filter(row => row.projectId === EMPTY_PROJECT_ID)
        .reduce((sum, row) => sum + (Number(row[field]) || 0), 0);

    const possibleHours = getPossibleHoursForColumn(field);
    const availableHours = possibleHours - emptyHours;

    const percentage = availableHours !== 0
        ? (projectHours / availableHours) * 100
        : 0;

    return {
        projectHours,
        availableHours,
        percentage
    };
}

function getPossibleHoursForColumn(field) {
    const year = Number(
        document.getElementById("reportYear").value
    );

    if (field === "total") {
        let totalPossibleHours = 0;

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            totalPossibleHours += calculateMonthlyWorkHours(
                year,
                monthIndex,
                workWeekHours
            );
        }

        return totalPossibleHours;
    }

    const monthIndex = MONTH_FIELDS.indexOf(field);

    if (monthIndex === -1) {
        return 0;
    }

    return calculateMonthlyWorkHours(
        year,
        monthIndex,
        workWeekHours
    );
}

function calculateMonthlyWorkHours(year, monthIndex, hoursPerWeekday) {
    const daysInMonth = new Date(
        year,
        monthIndex + 1,
        0
    ).getDate();

    let totalHours = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const current = new Date(year, monthIndex, day);

        // JavaScript: Sunday = 0
        // Our array: Monday = 0
        const weekdayIndex = (current.getDay() + 6) % 7;

        totalHours += hoursPerWeekday[weekdayIndex];
    }

    return Math.round(totalHours * 100) / 100;
}

async function loadWorkWeekHours() {
    const workWeekRows = await loadRows(WORK_WEEK_STORE_NAME);

    if (workWeekRows.length === 0) {
        return DEFAULT_WORK_WEEK_HOURS;
    }

    const workWeek = workWeekRows[0];

    return DAYS_IN_WEEK.map(
        (day) => Number(workWeek[`${day}Hours`]) || 0
    );
}

function formatHours(cell) {
    const value = cell.getValue();

    if (value === null || value === undefined || Number(value) === 0) {
        return "";
    }

    return Number(value).toFixed(2);
}

function roundRow(row) {
    const result = { ...row };

    [...MONTH_FIELDS, "total"].forEach(field => {
        result[field] = Math.round((result[field] + Number.EPSILON) * 100) / 100;
    });

    return result;
}

function normalizeProjectId(projectId) {
    return hasText(projectId) ? String(projectId).trim() : EMPTY_PROJECT_ID;
}

function hasText(value) {
    return typeof value === "string" && value.trim() !== "";
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}
