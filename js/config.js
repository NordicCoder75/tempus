export const DB_NAME = "TempusDB";
export const DB_VERSION = 3;

export const TIMESHEET_STORE_NAME = "timesheet";
export const SETUP_STORE_NAME = "setup";
export const WORK_WEEK_STORE_NAME = "workWeek";
export const FAVORITES_STORE_NAME = "favorites";

export const YEAR_WEEK_INDEX_NAME = "yearWeek";
export const PROJECT_ID_INDEX_NAME = "projectId";

export const DEFAULT_WORK_WEEK_HOURS = [
    7.4, 7.4, 7.4, 7.4, 7.4, 0.0, 0.0
];

export const DAYS_IN_WEEK = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
];

export const MONTHS_IN_YEAR = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
];

export const TIME_SHIFTS = [
    "DK: Working time",
    "SE: Working time",
    "NO: Working time",
    "Project time"
];


export const IMPORTABLE_STORES = {
    timesheet: [
        "year",
        "week",
        "projectId",
        "projectName",
        ...DAYS_IN_WEEK.flatMap(day => [
            `${day}Hours`,
            `${day}Desc`
        ])
    ],

    setup: [
        "employeeId",
        "internalTimeShift",
        "projectTimeShift"
    ],

    workWeek: DAYS_IN_WEEK.map(day => `${day}Hours`),

    favorites: [
        "projectId",
        "projectName"
    ]
};
