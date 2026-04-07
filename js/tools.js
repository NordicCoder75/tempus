// Basic sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Utility to get Monday's date of current week
function getMondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // adjust when day is Sunday
    d.setDate(d.getDate() + diff);
    return d;
}

// Utility to get ISO week number from date
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Utility to get ISO week year number from date
function getWeekYearNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    return d.getUTCFullYear();
}

//
function getDateOfMondayOfISOWeek(week, year, dayOffset = 0) {
    // Start from the 4th of January (always in week 1)
    const simple = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = simple.getUTCDay() || 7; // Sunday -> 7
    // Align back to Monday of week 1
    const isoWeek1Monday = new Date(simple);
    isoWeek1Monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
    // Add (week-1)*7 days to jump to requested week
    const targetMonday = new Date(isoWeek1Monday);
    targetMonday.setUTCDate(isoWeek1Monday.getUTCDate() + (week - 1) * 7 + dayOffset);
    return targetMonday.toISOString().slice(0, 10);
}

function getWeekDates(year, week) {
    year = parseInt(year, 10);
    week = parseInt(week, 10);

    // First Thursday of the year always in week 1 (ISO 8601 rule)
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dayOfWeek = simple.getUTCDay(); // 0 = Sunday, 1 = Monday...
    const isoWeekStart = new Date(simple);

    // shift to Monday of this ISO week
    const diff = (dayOfWeek <= 4 ? 1 - dayOfWeek : 8 - dayOfWeek);
    isoWeekStart.setUTCDate(simple.getUTCDate() + diff);

    // Build full week (Mon–Sun)
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(isoWeekStart);
        d.setUTCDate(isoWeekStart.getUTCDate() + i);
        days.push(d);
    }

    return days;
}

function getWeekdayHoursName(date) {
    const days = [
        "sundayHours", "mondayHours", "tuesdayHours",
        "wednesdayHours", "thursdayHours", "fridayHours", "saturdayHours"
    ];
    return days[date.getDay()];
}

function getDanishHolidays(year) {
    const easter = calculateEaster(year);

    const addDays = (date, days) => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    };

    return {
        "New Year's Day": new Date(year, 0, 1),
        "Maundy Thursday": addDays(easter, -3),
        "Good Friday": addDays(easter, -2),
        "Easter Sunday": easter,
        "Easter Monday": addDays(easter, 1),
        //"Great Prayer Day": addDays(easter, 26), // optional since 2024
        "Ascension Day": addDays(easter, 39),
        "Pentecost Sunday": addDays(easter, 49),
        "Whit Monday": addDays(easter, 50),
        //"Constitution Day": new Date(year, 5, 5), // not always a holiday
        "Christmas Day": new Date(year, 11, 25),
        "Boxing Day": new Date(year, 11, 26)
    };
}

function calculateEaster(year) {
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

    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    // JS Date: month is 0-based (0=Jan, 2=March, 3=April)
    return new Date(year, month - 1, day);
}

function kebabToCamel(kebabStr) { return kebabStr.toLowerCase().replace(/(-\w)/g, match => match[1].toUpperCase()); }
function camelToKebab(camelStr) { return camelStr.replace(/([A-Z])/g, letter => `-${letter.toLowerCase()}`); }
function snakeToCamel(snakeStr) { return snakeStr.toLowerCase().replace(/(_\w)/g, match => match[1].toUpperCase()); }
function camelToSnake(camelStr) { return camelStr.replace(/([A-Z])/g, letter => `_${letter.toLowerCase()}`); }
