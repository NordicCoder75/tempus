import {
    TIMESHEET_STORE_NAME,
    FAVORITES_STORE_NAME,
    SETUP_STORE_NAME,
    YEAR_WEEK_INDEX_NAME,
    DAYS_IN_WEEK
} from "../config.js";
import {
    loadRows,
    saveRow,
    createTimesheetRow
} from "./db-tools.js";
import {
    formatDateYMD,
    getCurrentYearAndWeekFromDate,
    getISOWeekDates,
    parseDateYMD,
    isValidYMDDateString,
    getMondayBasedDayIndex, formatTimeHMS
} from "./date-tools.js";
import { openFile } from "./file-tools.js";
import { getTimesheetYearWeek } from "../timesheet.js";

const DAYS = DAYS_IN_WEEK.map(day => ({
    hoursField: `${day}Hours`,
    descriptionField: `${day}Desc`
}));

export async function exportToQuinyx() {
    const setupRows = await loadRows(SETUP_STORE_NAME);

    if (setupRows.length === 0) {
        throw new Error("Setup parameters are missing.");
    }

    const setup = setupRows[0];

    validateSetup(setup);

    const timesheetYearWeek = getTimesheetYearWeek();
    const { year, week } = timesheetYearWeek ?? getCurrentYearAndWeekFromDate(new Date());

    const timesheetRows = await loadRows(
        TIMESHEET_STORE_NAME,
        YEAR_WEEK_INDEX_NAME,
        year,
        week
    );

    const weekDates = getISOWeekDates(year, week);

    const lines = [
        createHeader(setup),
        ...createTimeRegistrationLines(timesheetRows, weekDates),
        ""
    ];

    const content = lines.join("\r\n");

    const now = new Date();

    downloadTextFile(
        content,
        `${setup.employeeId}_${year}_${String(week).padStart(2, "0")}__${formatDateYMD(now)}_${formatTimeHMS(now, '-')}.csv`
    );
}

function validateSetup(setup) {
    const requiredFields = [
        ["employeeId", "Person ID"],
        ["internalTimeShift", "Internal time shift"],
        ["projectTimeShift", "Project time shift"]
    ];

    for (const [field, label] of requiredFields) {
        if (!normalizeText(setup[field])) {
            throw new Error(`${label} is missing in Setup.`);
        }
    }
}

function createHeader(setup) {
    return [
        `FORMAT VERSION;2;;`,
        `PERSON ID;${normalizeText(setup.employeeId)};;`,
        `INTERNAL TIME SHIFT;${normalizeText(setup.internalTimeShift)};;`,
        `PROJECT TIME SHIFT;${normalizeText(setup.projectTimeShift)};;`,
        `;;;`,
        `DATE;PROJECT ID;HOURS;COMMENT`
    ].join("\r\n");
}

function createTimeRegistrationLines(timesheetRows, weekDates) {
    const lines = [];


    for (const row of timesheetRows) {
        const projectId = normalizeText(row.projectId);

        if (!projectId) {
            continue;
        }

        DAYS.forEach((day, index) => {
            const hours = Number(row[day.hoursField]);

            if (!Number.isFinite(hours) || hours <= 0) {
                return;
            }

            const description = sanitizeField(
                row[day.descriptionField]
            );

            lines.push([
                formatDateYMD(weekDates[index]),
                projectId,
                formatHours(hours),
                description
            ].join(";"));
        });
    }

    return lines;
}

function formatHours(hours) {
    return Number.isInteger(hours)
        ? String(hours)
        : String(hours);
}

function sanitizeField(value) {
    return normalizeText(value)
        .replace(/;/g, ",")
        .replace(/[\r\n]+/g, " ");
}

function normalizeText(value) {
    return typeof value === "string"
        ? value.trim()
        : value == null
            ? ""
            : String(value).trim();
}

function downloadTextFile(content, fileName) {
    const blob = new Blob(
        [content],
        {type: "text/plain;charset=utf-8"}
    );


    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

export async function importFromQuinyx() {
    const file = await openFile(".txt,.csv");

    const content = await file.text();
    const registrations = parseQuinyxFile(content);

    if (registrations.length === 0) {
        throw new Error("No time registration lines were found in the selected Quinyx file.");
    }

    await importTimeRegistrations(registrations);

    location.reload();
}

function parseQuinyxFile(content) {
    const normalizedContent = content
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");


    const lines = normalizedContent
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    const headerIndex = lines.findIndex(isRegistrationHeader);

    if (headerIndex === -1) {
        throw new Error("The file does not contain a valid Quinyx DATE;PROJECT ID;HOURS;COMMENT header.");
    }

    const registrations = [];

    for (let index = headerIndex + 1; index < lines.length; index++) {
        const registration = parseRegistrationLine(lines[index], index + 1);

        if (registration) {
            registrations.push(registration);
        }
    }

    return registrations;
}

function isRegistrationHeader(line) {
    const columns = line
        .split(";")
        .map(column => column.trim().toUpperCase());

    return (
        columns.length >= 4 &&
        columns[0] === "DATE" &&
        columns[1] === "PROJECT ID" &&
        columns[2] === "HOURS" &&
        columns[3] === "COMMENT"
    );
}

function parseRegistrationLine(line, lineNumber) {
    const columns = line.split(";");

    if (columns.length < 3) {
        throw new Error(`Invalid Quinyx registration at line ${lineNumber}.`);
    }

    const date = columns[0].trim();
    const projectId = columns[1].trim();
    const hoursText = columns[2].trim();

    // Join remaining columns to preserve comments containing semicolons.
    const comment = columns
        .slice(3)
        .join(";")
        .trim();

    if (!date && !projectId && !hoursText && !comment) {
        return null;
    }

    if (!isValidYMDDateString(date)) {
        throw new Error(`Invalid DATE "${date}" at line ${lineNumber}. Expected YYYY-MM-DD.`);
    }

    if (!projectId) {
        throw new Error(`Missing PROJECT ID at line ${lineNumber}.`);
    }

    const hours = parseHours(hoursText);

    if (!Number.isFinite(hours) || hours < 0) {
        throw new Error(`Invalid HOURS "${hoursText}" at line ${lineNumber}.`);
    }

    return {date, projectId, hours, comment};
}

function parseHours(value) {
    return Number(
        String(value)
            .trim()
            .replace(",", ".")
    );
}

async function importTimeRegistrations(registrations) {
    const favorites = await loadRows(FAVORITES_STORE_NAME);

    const projectNamesByProjectId = new Map(
        favorites.map(favorite => [
            normalizeProjectId(favorite.projectId),
            favorite.projectName ?? ""
        ])
    );

    const registrationsByWeek = groupRegistrationsByWeek(registrations);

    for (const weekRegistrations of registrationsByWeek.values()) {
        await importWeekRegistrations(
            weekRegistrations,
            projectNamesByProjectId
        );
    }
}

function groupRegistrationsByWeek(registrations) {
    const registrationsByWeek = new Map();

    for (const registration of registrations) {
        const date = parseDateYMD(registration.date);

        const {year, week} = getCurrentYearAndWeekFromDate(date);
        const key = `${year}-${week}`;

        if (!registrationsByWeek.has(key)) {
            registrationsByWeek.set(key, {
                year,
                week,
                registrations: []
            });
        }

        registrationsByWeek
            .get(key)
            .registrations
            .push({
                ...registration,
                date
            });
    }

    return registrationsByWeek;
}

async function importWeekRegistrations(
    {year, week, registrations},
    projectNamesByProjectId
) {
    const rowsByProjectId = new Map();

    for (const registration of registrations) {
        const projectId = normalizeProjectId(registration.projectId);

        if (!rowsByProjectId.has(projectId)) {
            rowsByProjectId.set(projectId, []);
        }

        const projectRows = rowsByProjectId.get(projectId);

        const dayIndex = getMondayBasedDayIndex(
            registration.date
        );

        const {hoursField, descriptionField} =
            DAYS[dayIndex];

        let row = projectRows.find(existingRow => {
            return existingRow[hoursField] == null;
        });

        if (!row) {
            const projectName =
                projectNamesByProjectId.get(projectId) ?? "";

            row = createTimesheetRow(
                year,
                week,
                projectId,
                projectName
            );

            projectRows.push(row);
        }

        row[hoursField] = registration.hours;
        row[descriptionField] = registration.comment;
        row.totalHours = calculateTotalHours(row);
    }

    for (const projectRows of rowsByProjectId.values()) {
        for (const row of projectRows) {
            await saveRow(TIMESHEET_STORE_NAME, row);
        }
    }
}

function calculateTotalHours(row) {
    return DAYS.reduce((total, day) => {
        const value = Number(row[day.hoursField]);

        return total + (Number.isFinite(value) ? value : 0);
    }, 0);
}

function normalizeProjectId(value) {
    return String(value ?? "").trim();
}
