const MS_PER_DAY = 24 * 60 * 60 * 1000;

/*
 * DateTime → "DD-MM-YYYY"
 */
export function formatDateDMY(date, separator = '-') {
    const {year, month, day} = getDateParts(date);

    return `${day}${separator}${month}${separator}${year}`;
}

/*
 * DateTime → "YYYY-MM-DD"
 */
export function formatDateYMD(date, separator = '-') {
    const {year, month, day} = getDateParts(date);

    return `${year}${separator}${month}${separator}${day}`;
}

/*
 * DateTime → "HH-MM-SS"
 */
export function formatTimeHMS(date, separator = ':') {
    const {hour, minute, second} = getTimeParts(date);

    return `${hour}${separator}${minute}${separator}${second}`;
}

/*
 * "DD-MM-YYYY" → Date
 */
export function parseDateDMY(value) {
    if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) {
        throw new Error("Format must be DD-MM-YYYY!")
    }

    const [day, month, year] = value.split("-").map(Number);

    return new Date(year, month - 1, day);
}

/*
 * "YYYY-MM-DD" → Date
 */
export function parseDateYMD(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error("Format must be YYYY-MM-DD!")
    }

    const [year, month, day] = value.split("-").map(Number);

    return new Date(year, month - 1, day);
}

/*
 * Checks whether the string is a real date
 */
export function isValidYMDDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = parseDateYMD(value);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

/*
 * Date → Monday-based day index (0–6)
 */
export function getMondayBasedDayIndex(date) {
    return (date.getDay() + 6) % 7;
}

/*
 * Date → ISO year/week
 */
export function getCurrentYearAndWeekFromDate(currentDate) {
    const date = getISOWeekAnchorDate(currentDate);
    const year = date.getFullYear();
    const firstThursday = getISOWeekAnchorDate(new Date(year, 0, 4));
    const week = 1 + Math.round((date - firstThursday) / MS_PER_DAY / 7);

    return { year, week };
}

/*
 * ISO year/week → Array of 7 Dates (Monday–Sunday)
 */
export function getISOWeekDates(year, week) {
    const monday = getISOWeekMonday(year, week);

    const days = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        days.push(date);
    }

    return days;
}

/*
 * ISO year/week → Date (Thursday)
 */
export function getDateFromISOWeek(year, week) {
    const targetDate = new Date(getISOWeekMonday(year, week));

    targetDate.setDate(targetDate.getDate() + 3);

    return targetDate;
}

/*
 * Date → ISO week-year
 */
export function getISOWeekYear(date) {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

    const dayNumber = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNumber);

    return target.getUTCFullYear();
}

/*
 * Date → ISO week number
 */
export function getWeekNumber(date) {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

    const dayNumber = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNumber);

    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));

    return Math.ceil((((target - yearStart) / MS_PER_DAY) + 1) / 7);
}



/*
 * Private helpers
 */

// Date → {year, month, day}
function getDateParts(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return {year, month, day};
}

// Date → {hour, minute, second}
function getTimeParts(date) {
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return {hour, minute, second};
}

// Date → ISO week anchor date (Thursday)
function getISOWeekAnchorDate(date) {
    const target = toLocalDate(date);
    const day = getMondayBasedDayIndex(target);
    target.setDate(target.getDate() - day + 3);
    return target;
}

// Date → Local date at midnight
function toLocalDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// ISO year/week → Monday of that ISO week
function getISOWeekMonday(year, week) {
    const monday = new Date(getISOWeek1Monday(year));
    monday.setDate(monday.getDate() + (week - 1) * 7);
    return monday;
}

// ISO year → First Monday of ISO week 1
function getISOWeek1Monday(year) {
    const jan4 = new Date(year, 0, 4);
    const dayIndex = getMondayBasedDayIndex(jan4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - dayIndex);
    return monday;
}
