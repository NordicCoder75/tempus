import {
    formatDateYMD,
    getDateFromISOWeek,
    getISOWeekYear,
    getWeekNumber
} from "../tools/date-tools.js";

let selectedYear = null;
let selectedWeek = null;
let currentDate = getInitialDate();

const monthYear = document.getElementById("monthYear");
const calendarDays = document.getElementById("calendarDays");

renderCalendar();

document.getElementById("prevMonth").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
});

function renderCalendar() {
    calendarDays.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayIndex = (firstDay.getDay() + 6) % 7;
    const numberOfDays = lastDay.getDate();
    const formatter = new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric"
    });

    monthYear.textContent = formatter.format(currentDate);

    const totalCells = firstDayIndex + numberOfDays;
    const numberOfWeeks = Math.ceil(totalCells / 7);
    const totalRows = 6;
    const rowOffset = numberOfWeeks === 4 ? 1 : 0;
    const firstDisplayedDate = new Date(year, month, 1 - firstDayIndex - (rowOffset * 7));

    for (let week = 0; week < totalRows; week++) {
        const weekStartOffset = week * 7;
        const weekStartDate = new Date(firstDisplayedDate);
        weekStartDate.setDate(firstDisplayedDate.getDate() + weekStartOffset);

        const weekNumber = document.createElement("div");
        weekNumber.classList.add("week-number");
        weekNumber.textContent = getWeekNumber(weekStartDate);
        calendarDays.appendChild(weekNumber);

        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const date = new Date(firstDisplayedDate);
            date.setDate(firstDisplayedDate.getDate() + weekStartOffset + dayOfWeek);

            const button = document.createElement("button");
            button.type = "button";
            button.classList.add("day");

            if (dayOfWeek >= 5) {
                button.classList.add("weekend");
            }

            if (date.getMonth() !== month) {
                button.classList.add("outside-month");
            }

            button.textContent = date.getDate();

            if (isToday(date)) {
                button.classList.add("today");
            }

            if (getISOWeekYear(date) === selectedYear && getWeekNumber(date) === selectedWeek) {
                button.classList.add("selected-week");
            }

            button.addEventListener("click", () => selectDate(date));
            calendarDays.appendChild(button);
        }
    }
}

function selectDate(date) {
    window.parent.postMessage(
        {
            type: "dateSelected",
            date: formatDateYMD(date),
            close: true
        },
        "*"
    );
}

function isToday(date) {
    const today = new Date();

    return date.getFullYear() === today.getFullYear()
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
}

function getInitialDate() {
    const params = new URLSearchParams(window.location.search);
    const year = Number(params.get("year"));
    const week = Number(params.get("week"));

    if (Number.isInteger(year) && Number.isInteger(week) && week >= 1 && week <= 53) {
        selectedYear = year;
        selectedWeek = week;
        return getDateFromISOWeek(year, week);
    }

    return new Date();
}
