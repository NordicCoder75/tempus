import {
    TIMESHEET_STORE_NAME,
    WORK_WEEK_STORE_NAME,
    DAYS_IN_WEEK
} from "../config.js";
import {
    initDatabase,
    loadRows,
    saveRow,
    createTimesheetRow
} from "../tools/db-tools.js";
import {getCurrentYearAndWeekFromDate, getMondayBasedDayIndex} from "../tools/date-tools.js";

let holidayTable;

initHolidays().catch(error => {
    console.error("Failed to initialize holidays:", error);
});

async function initHolidays() {
    await initDatabase();

    document.getElementById("year").value = new Date().getFullYear();

    holidayTable = new Tabulator("#holidayTable", {
        index: "id",
        layout: "fitColumns",
        width: "100%",
        height: "100%",
        placeholder: "No holidays generated",
        columns: createHolidayColumns()
    });

    document.getElementById("generateButton").addEventListener("click", generateHolidays);
    document.getElementById("insertButton").addEventListener("click", insertHolidays);
}

function createHolidayColumns() {
    return [
        {
            title: "",
            formatter: deleteRowButtonFormatter,
            width: 40,
            minWidth: 40,
            maxWidth: 40,
            hozAlign: "center",
            headerSort: false,
            cellClick: (_, cell) => {
                cell.getRow().delete();
            }
        },
        {
            title: "Date",
            field: "displayDate",
            widthGrow: 1,
            editor: "input",
            editable: false
        },
        {
            title: "Name",
            field: "name",
            widthGrow: 3,
            editor: "input",
            editable: true
        }
    ];
}

function deleteRowButtonFormatter() {
    return '<button type="button" class="delete-btn" aria-label="Delete holiday">X</button>';
}

function generateHolidays() {
    const country = document.getElementById("country").value;
    const year = Number(document.getElementById("year").value);

    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        alert("Please enter a valid year between 1900 and 2100.");
        return;
    }

    let holidays = [];

    if (country === "DK") {
        holidays = getDanishHolidays(year);
    } else if (country === "SE") {
        holidays = getSwedishHolidays(year);
    }

    holidayTable.replaceData(holidays);
}

async function insertHolidays() {
    const holidays = holidayTable.getData();

    if (holidays.length === 0) {
        alert("Generate holidays before inserting them.");
        return;
    }

    try {
        const workWeekRows = await loadRows(WORK_WEEK_STORE_NAME);

        if (workWeekRows.length === 0) {
            alert("No work week configuration found.");
            return;
        }

        const workWeek = workWeekRows[0];
        const insertedRows = [];

        for (const holiday of holidays) {
            const holidayDate = parseDateValue(holiday.date);

            const timesheetRow = createHolidayTimesheetRow(
                holiday,
                holidayDate,
                workWeek
            );

            timesheetRow.id = await saveRow(TIMESHEET_STORE_NAME, timesheetRow);

            insertedRows.push(timesheetRow);
        }

        alert(`${insertedRows.length} holiday(s) inserted into the timesheet.`);

        console.log("Inserted holiday timesheet rows:", insertedRows);
    } catch (error) {
        console.error("Failed to insert holidays into the timesheet:", error);

        alert("Failed to insert holidays into the timesheet.");
    }
}

function getDanishHolidays(year) {
    const easterSunday = calcEasterSunday(year);

    const holidays = [
        { date: new Date(year, 0, 1), name: "New Year's Day" },
        { date: addDays(easterSunday, -3), name: "Maundy Thursday" },
        { date: addDays(easterSunday, -2), name: "Good Friday" },
        { date: addDays(easterSunday, 0), name: "Easter Sunday" },
        { date: addDays(easterSunday, 1), name: "Easter Monday" },
        { date: addDays(easterSunday, 39), name: "Ascension Day" },
        { date: addDays(easterSunday, 49), name: "Whit Sunday" },
        { date: addDays(easterSunday, 50), name: "Whit Monday" },
        { date: new Date(year, 11, 25), name: "Christmas Day" },
        { date: new Date(year, 11, 26), name: "Second Day of Christmas" },
        // following are not holidays for all Danes
        { date: new Date(year, 4, 1), name: "International Workers' Day" },
        { date: new Date(year, 5, 5), name: "Constitution Day" },
        { date: new Date(year, 11, 24), name: "Christmas Eve" },
        { date: new Date(year, 11, 31), name: "New Year's Eve" }
    ];

    return holidays
        .sort((a, b) => a.date - b.date)
        .map((holiday, index) => ({
            id: index + 1,
            date: formatDateValue(holiday.date),
            displayDate: formatHolidayDate(holiday.date),
            name: holiday.name
        }));
}

function getSwedishHolidays(year) {
    const easterSunday = calcEasterSunday(year);
    const midsummerDay = calcMidsummerDay(year);

    const holidays = [
        {date: new Date(year, 0, 1), name: "New Year's Day"},
        {date: new Date(year, 0, 6), name: "Epiphany"},
        {date: addDays(easterSunday, -2), name: "Good Friday"},
        {date: addDays(easterSunday, 1), name: "Easter Monday"},
        {date: new Date(year, 4, 1), name: "International Workers' Day"},
        {date: addDays(easterSunday, 39), name: "Ascension Day"},
        {date: new Date(year, 5, 6), name: "National Day"},
        {date: addDays(midsummerDay, 0), name: "Midsummer Day"},
        {date: calcAllSaintsDay(year), name: "All Saints' Day"},
        {date: new Date(year, 11, 25), name: "Christmas Day"},
        {date: new Date(year, 11, 26), name: "Second Day of Christmas"},
        // Always on Saturdays
        {date: addDays(easterSunday, -1), name: "Easter Eve"},
        // Always on Sundays
        {date: addDays(easterSunday, 0), name: "Easter Sunday"},
        {date: addDays(easterSunday, 49), name: "Pentecost Sunday"},
        // Common equivalent / de facto holidays
        {date: addDays(midsummerDay, -1), name: "Midsummer Eve"},
        {date: new Date(year, 11, 24), name: "Christmas Eve"},
        {date: new Date(year, 11, 31), name: "New Year's Eve"}
    ];

    return holidays
        .sort((a, b) => a.date - b.date)
        .map((holiday, index) => ({
            id: index + 1,
            date: formatDateValue(holiday.date),
            displayDate: formatHolidayDate(holiday.date),
            name: holiday.name
        }));
}

function calcEasterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(year, month, day);
}

function calcMidsummerDay(year) {
    for (let day = 20; day <= 26; day++) {
        const date = new Date(year, 5, day);

        if (date.getDay() === 6) {
            return date;
        }
    }
}

function calcAllSaintsDay(year) {
    for (let day = 31; day <= 37; day++) {
        const date = new Date(year, 9, day);

        if (date.getDay() === 6) {
            return date;
        }
    }
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);

    return result;
}

function formatDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatHolidayDate(date) {
    const weekday = date.toLocaleDateString("en-US", {weekday: "long"});
    const month = date.toLocaleDateString("en-US", {month: "long"});
    const day = date.getDate();

    return `${weekday}, ${month} ${day}${getOrdinalSuffix(day)}`;
}

function getOrdinalSuffix(day) {
    if (day >= 11 && day <= 13) {
        return "th";
    }

    switch (day % 10) {
        case 1:
            return "st";
        case 2:
            return "nd";
        case 3:
            return "rd";
        default:
            return "th";
    }
}

function createHolidayTimesheetRow(holiday, holidayDate, workWeek) {
    const {year, week} = getCurrentYearAndWeekFromDate(holidayDate);

    const dayField = getTimesheetDayField(holidayDate);
    const hoursField = `${dayField}Hours`;
    const descriptionField = `${dayField}Desc`;

    const row = createTimesheetRow(year, week, "", holiday.name);

    row[hoursField] = workWeek[hoursField] ?? 0;
    row[descriptionField] = holiday.name;

    row.totalHours = Number(row[hoursField]) || 0;

    return row;
}

function getTimesheetDayField(date) {
    return DAYS_IN_WEEK[getMondayBasedDayIndex(date)];
}

function parseDateValue(dateValue) {
    const [year, month, day] = dateValue
        .split("-")
        .map(Number);

    return new Date(year, month - 1, day);
}

