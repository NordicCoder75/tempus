let weekHeader;
let currentDay = new Date();
let weekNum;
let monday;
let sunday;

let currentDate;
let today = new Date();
let selectedDay;

// noinspection JSUnusedGlobalSymbols
window.TimesheetPage = {
    async init() {
        weekHeader = document.getElementById('timesheet-period');

        await updateWeekHeader();

        // Calendar & week navigation buttons
        const calendarBtn = document.getElementById('timesheet-calendar-btn');
        const prevWeekBtn = document.getElementById('timesheet-prev-week-btn');
        const nextWeekBtn = document.getElementById('timesheet-next-week-btn');

        if (calendarBtn) calendarBtn.addEventListener('click', async (e) => {
            await calendarInit(currentDay);
        });

        if (prevWeekBtn) prevWeekBtn.addEventListener('click', async () => {
            currentDay.setDate(currentDay.getDate() - 7);
            await updateWeekHeader();
        });
        if (nextWeekBtn) nextWeekBtn.addEventListener('click', async () => {
            currentDay.setDate(currentDay.getDate() + 7);
            await updateWeekHeader();
        });

        showMenuItemGroup("timesheet");
    }
};

function simulateClick() {
    const link = document.querySelector('[data-page="partials/timesheet.html"]');
    link.click();
}

async function updateWeekHeader() {
    weekNum = getWeekNumber(currentDay);
    monday = getMondayOfWeek(currentDay);
    sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    //weekHeader.textContent = `${formatDate(monday)} - ${formatDate(sunday)} (Week ${weekNum})`;
    weekHeader.textContent = `Week ${weekNum} - ${getWeekYearNumber(monday)}`;

    await updateTimesheetDayHeaders(monday); // somewhat of a hack, but it works !

    await loadTable("timesheet");
}

// Format date as dd-mm-yyyy
function formatDate(d) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function fillRowYearWeek(entityName, tr) {
    const year = currentDay.getFullYear();
    const week = getWeekNumber(currentDay);

    tr.querySelector('[data-idb-key="year"]').textContent = year;
    tr.querySelector('[data-idb-key="week"]').textContent = week;
}

function getCurrentDayYearNumber() {
    const d = new Date(Date.UTC(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate())); // Clone date so we don't mutate input
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // ISO week starts on Monday; shift to Thursday in current week to find ISO year
    return d.getUTCFullYear(); // Return the year of that "Thursday"
}

function getCurrentDayWeekNumber() {
    return getWeekNumber(currentDay);
}

function calendarInit(startDate) {
    const container = document.getElementById('calendar-container');

    // Hide the calendar if button pressed again while it's open
    if (container.style.display === 'block') {
        container.style.display = 'none';
        return;
    }

    // Show the calendar
    container.style.display = 'block';

    // Place the calendar just below the button
    const calendarBtn = document.getElementById('timesheet-calendar-btn');
    const rect = calendarBtn.getBoundingClientRect();
    container.style.top = rect.bottom + window.scrollY + 'px';
    container.style.left = rect.left + window.scrollX + 'px';

    // Temporarily add an outside-of-calender-click handler
    const outsideClickHandler = (event) => {
        if (!container.contains(event.target) && event.target !== calendarBtn) {
            container.style.display = 'none';
            document.removeEventListener('click', outsideClickHandler);
        }
    };
    document.addEventListener('click', outsideClickHandler);

    // Init the calendar's parameters
    currentDate = startDate ? new Date(startDate) : new Date();
    selectedDay = startDate ? new Date(startDate) : today; // save the week to highlight

    // Temporarily add a calendar-week-selection-click handler
    const calendarWeekSelected = async (event) => {
        const calendarWeek = document.getElementById('calendar-week-table');
        if (calendarWeek.contains(event.target)) {
            const tr = event.target.closest('tr');
            const dateMonday = tr.getAttribute('date-monday');

            document.getElementById('calendar-container').style.display = 'none';
            currentDay = new Date(parseLocalDate(dateMonday));
            document.removeEventListener('click', calendarWeekSelected);
            await updateWeekHeader();
        }
    }
    document.addEventListener('click', calendarWeekSelected);

    renderCalendar();
}

function renderCalendar() {
    updateCalendarHeader();

    const tbody = document.querySelector("#calendar-week-table tbody");
    tbody.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const weeks = getWeeksInMonth(year, month);

    weeks.forEach((weekData) => {
        const tr = document.createElement("tr");

        tr.classList.add("calendar-week-row");
        tr.setAttribute("date-monday", formatDateLocal(weekData.days[0].date));

        // Highlight the week containing selectedDay
        if (weekData.days.some(dayObj => isSameWeek(dayObj.date, selectedDay))) {
            tr.classList.add("calendar-selected-week");
        }

        const weekCell = document.createElement("td");
        weekCell.classList.add("calendar-week-number");
        weekCell.textContent = weekData.weekNumber;
        tr.appendChild(weekCell);

        weekData.days.forEach((day, i) => {
            const td = document.createElement("td");
            td.textContent = day.date.getDate().toString();
            if (!day.isCurrentMonth) {
                td.style.color = "#aaa"; // grey text
            }
            if (i >= 5) td.classList.add("calendar-weekend");
            if (isSameDate(day.date, today)) td.classList.add("calendar-today");
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
}

// Formats a JavaScript Date into a yyyy-MM-dd string using the local timezone
function formatDateLocal(date) {
    return date.toLocaleDateString("en-CA", {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
}

function formatTimeLocal(date) {
    return date.toLocaleTimeString("en-GB", {  // en-GB ensures 24h format
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
}

// Parses a yyyy-MM-dd string into a JavaScript Date object set to local midnight in the user’s timezone
function parseLocalDate(str) {
    const [year, month, day] = str.split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-based in JS
}

function updateCalendarHeader() {
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    document.getElementById("calendar-current-month").textContent =
        `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
}

function getWeeksInMonth(year, month) {
    const weeks = [];
    let date = new Date(year, month, 1);
    let monday = getMondayOfWeek(date);

    while (true) {
        const week = [];
        let weekNumber = getWeekNumber(monday);

        for (let i = 0; i < 7; i++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + i);
            week.push({
                date: day,
                isCurrentMonth: day.getMonth() === month
            });
        }

        weeks.push({weekNumber, days: week});

        monday.setDate(monday.getDate() + 7);

        if (weeks.length === 6) {
            break;
        }
    }

    return weeks;
}

function isSameWeek(date1, date2) {
    const monday1 = getMondayOfWeek(date1);
    const monday2 = getMondayOfWeek(date2);
    return isSameDate(monday1, monday2);
}

function isSameDate(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}

function changeDate(amount, type) {
    if (type === 'month') {
        currentDate.setMonth(currentDate.getMonth() + amount);
    } else if (type === 'year') {
        currentDate.setFullYear(currentDate.getFullYear() + amount);
    }

    renderCalendar();
}

/*
 * Extending framework functions
 */
function onAfterCellOnChangedEvent(cell) {
    cell.addEventListener("input", async (event) => {
        const td = event.target;

        if (td.hasAttribute("type") && td.getAttribute("type") === "number") {
            updateTotal(td); // Update totals row
        }
    });

}

async function onAfterLoadTableRow(row) {
    updateTotal(row); // Update totals row
}

async function updateTimesheetDayHeaders(mondayDate) {
    // Ensure mondayDate is a Date
    const start = new Date(mondayDate);

    // Weekday names in the same order as your HTML
    const dayNames = [
        "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday", "Sunday"
    ];

    // Select only the top header row day cells (NOT the ones in row 2)
    const headerCells = document.querySelectorAll(
        'thead > tr:first-child .timesheet-day-header'
    );

    // headerCells contains 14 <th> (each day has 2 columns)
    // We update only every 2nd (0,2,4,6...)
    for (let i = 0; i < 7; i++) {
        const th = headerCells[i]; // the name cell (hours/descriptions come after)
        const date = new Date(start);
        date.setDate(start.getDate() + i);

        const dd = String(date.getDate()).padStart(2, "0");
        const mm = String(date.getMonth() + 1).padStart(2, "0");

        th.textContent = `${dayNames[i]} (${dd}.${mm})`;
    }
}