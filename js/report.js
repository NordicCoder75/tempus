let yearHeader;
let reportDay = new Date();
const emptyProjectId = "(empty)";
const emptyProjectName = "Leave & Holidays"

// noinspection JSUnusedGlobalSymbols
window.ReportPage = {
    async init() {
        yearHeader = document.getElementById('report-period');

        await updateReportHeader();

        const prevYearBtn = document.getElementById('report-prev-year-btn');
        const nextYearBtn = document.getElementById('report-next-year-btn');

        if (prevYearBtn) prevYearBtn.addEventListener('click', async () => {
            reportDay.setFullYear(reportDay.getFullYear() - 1);
            await updateReportHeader();
        });
        if (nextYearBtn) nextYearBtn.addEventListener('click', async () => {
            reportDay.setFullYear(reportDay.getFullYear() + 1);
            await updateReportHeader();
        });
    }
};

async function updateReportHeader() {
    yearHeader.textContent = `${reportDay.getFullYear()}`;

    await buildReport();

    await loadTable("report", false);

    // Make all cells non-editable and change style on totals-row
    const table = document.getElementById("report");
    table.querySelectorAll("[contenteditable='true']").forEach(cell => {
        cell.setAttribute("contenteditable", "false");
    });
    const tbody = table.tBodies[0];
    const lastRow = tbody.querySelector("tr:last-child");
    lastRow.classList.add("report-total");

    await updateTotalRow();
}

async function buildReport() {
    const reportYear = reportDay.getFullYear(); // the year we want to report
    const db = await openDB();
    const favorites = await getIndexedRecords("favorites");

    return new Promise((resolve, reject) => {
        const tx = db.transaction(["timesheet", "report"], "readwrite");
        const timesheetStore = tx.objectStore("timesheet");
        const reportStore = tx.objectStore("report");

        // clear old report first
        reportStore.clear();

        const cursorReq = timesheetStore.index("year-week-idx").openCursor();

        const projectMap = new Map();

        cursorReq.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const rec = cursor.value;
                const pid = rec.projectId || emptyProjectId;

                if (!projectMap.has(pid)) {
                    projectMap.set(pid, {
                        projectId: pid,
                        projectName: rec.projectName || "",
                        januaryHours: 0, februaryHours: 0, marchHours: 0, aprilHours: 0,
                        mayHours: 0, juneHours: 0, julyHours: 0, augustHours: 0,
                        septemberHours: 0, octoberHours: 0, novemberHours: 0, decemberHours: 0,
                        total: 0
                    });
                }

                // Set the project name to the current entry if not blank
                if (rec.projectName !== "") {
                    const entry = projectMap.get(pid);
                    entry.projectName = rec.projectName;
                }

                // Set the project id to the default 'empty'-value
                if (pid === emptyProjectId) {
                    const entry = projectMap.get(pid);
                    entry.projectName = emptyProjectName;
                }

                const entry = projectMap.get(pid);

                const weekDates = getWeekDates(rec.year, rec.week);

                const dayKeys = [
                    "mondayHours", "tuesdayHours", "wednesdayHours",
                    "thursdayHours", "fridayHours", "saturdayHours", "sundayHours"
                ];
                const monthNames = [
                    "januaryHours", "februaryHours", "marchHours", "aprilHours", "mayHours", "juneHours",
                    "julyHours", "augustHours", "septemberHours", "octoberHours", "novemberHours", "decemberHours"
                ];

                weekDates.forEach((date, i) => {
                    if (date.getFullYear() === reportYear) {
                        const hours = parseFloat(rec[dayKeys[i]]) || 0;
                        const monthName = monthNames[date.getMonth()];
                        entry[monthName] += hours;
                        entry.total += hours;

                        entry[monthName] = Math.round(entry[monthName] * 100) / 100;
                        entry.total = Math.round(entry.total * 100) / 100;
                    }
                });

                cursor.continue();
            } else {
                // finished scanning, write aggregated report (but skip empty ones)
                let totals = {
                    projectId: "TOTAL",
                    projectName: "",
                    januaryHours: 0, februaryHours: 0, marchHours: 0, aprilHours: 0,
                    mayHours: 0, juneHours: 0, julyHours: 0, augustHours: 0,
                    septemberHours: 0, octoberHours: 0, novemberHours: 0, decemberHours: 0,
                    total: 0
                };

                // Collect valid rows
                const validRows = [];

                for (let row of projectMap.values()) {
                    const allZero = [
                        row.januaryHours, row.februaryHours, row.marchHours, row.aprilHours,
                        row.mayHours, row.juneHours, row.julyHours, row.augustHours,
                        row.septemberHours, row.octoberHours, row.novemberHours, row.decemberHours
                    ].every(h => h === 0);

                    if (!allZero) {
                        const dbRow = favorites.find(f => f.value.projectId === row.projectId);
                        if (dbRow?.value?.projectName && row.projectName === "") {
                            row.projectName = dbRow.value.projectName;
                        }
                        validRows.push(row);
                    }
                }

                // Sort ascending by projectId (case-insensitive)
                validRows.sort((a, b) => {
                    const aId = a.projectId?.toString().toLowerCase() || "";
                    const bId = b.projectId?.toString().toLowerCase() || "";
                    return aId.localeCompare(bId);
                });

                // Write sorted rows & compute totals
                for (let row of validRows) {
                    //if (row.projectId !== emptyProjectId) { <-- unsure if I want vacation etc. to be included in the totals; for now it is
                        totals.januaryHours += row.januaryHours;
                        totals.februaryHours += row.februaryHours;
                        totals.marchHours += row.marchHours;
                        totals.aprilHours += row.aprilHours;
                        totals.mayHours += row.mayHours;
                        totals.juneHours += row.juneHours;
                        totals.julyHours += row.julyHours;
                        totals.augustHours += row.augustHours;
                        totals.septemberHours += row.septemberHours;
                        totals.octoberHours += row.octoberHours;
                        totals.novemberHours += row.novemberHours;
                        totals.decemberHours += row.decemberHours;
                        totals.total += row.total;
                    //}
                }

                // Round totals to 2 decimals
                const hourKeys = [
                    "januaryHours", "februaryHours", "marchHours", "aprilHours",
                    "mayHours", "juneHours", "julyHours", "augustHours",
                    "septemberHours", "octoberHours", "novemberHours", "decemberHours", "total"
                ];

                // Apply this to each row before adding (but empty 0.00 cells)
                validRows.forEach(row => {
                    hourKeys.forEach(k => {
                        const val = row[k];
                        const fixed = Number(val).toFixed(2);
                        row[k] = (parseFloat(fixed) === 0) ? "" : fixed;
                    });
                    reportStore.add(row);
                });

                // Add the TOTAL row at the very end (but empty 0.00 cells)
                hourKeys.forEach(k => {
                    const val = totals[k];
                    const fixed = Number(val).toFixed(2);
                    totals[k] = (parseFloat(fixed) === 0) ? "" : fixed;
                });
                reportStore.add(totals);
            }
        };

        tx.oncomplete = () => resolve(true);
        tx.onerror = (err) => reject(err);
    });
}

function calculateMonthlyWorkHours(dateString, hoursPerWeekday) {
    // hoursPerWeekday = [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
    const inputDate = new Date(dateString);

    const year = inputDate.getFullYear();
    const month = inputDate.getMonth(); // 0-indexed (0 = Jan)

    // Get number of days in this month
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let totalHours = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const current = new Date(year, month, day);
        // JS: 0 = Sun, 1 = Mon, ..., 6 = Sat
        let jsDay = current.getDay();
        // Convert JS weekday -> array index (Mon = 0)
        let weekdayIndex = (jsDay + 6) % 7;

        totalHours += hoursPerWeekday[weekdayIndex];
    }

    return Math.round(totalHours * 100) / 100;
}

async function defaultWorkHours() {
    let hoursPerWeekday = [7.4, 7.4, 7.4, 7.4, 7.4, 0, 0]; // default values

    let record = await getRecordByKey('setup', 1);
    if (record) {
        hoursPerWeekday = [
            parseFloat(record.mondayHours) || 0.0,
            parseFloat(record.tuesdayHours) || 0.0,
            parseFloat(record.wednesdayHours) || 0.0,
            parseFloat(record.thursdayHours) || 0.0,
            parseFloat(record.fridayHours) || 0.0,
            parseFloat(record.saturdayHours) || 0.0,
            parseFloat(record.sundayHours) || 0.0];
    }

    return hoursPerWeekday;
}

async function updateTotalRow() {
    const hoursPerWeekday = await defaultWorkHours();

    const totalRow = document.querySelector("#report tbody tr.report-total");
    if (!totalRow) return;

    const monthKeys = [
        "januaryHours", "februaryHours", "marchHours", "aprilHours",
        "mayHours", "juneHours", "julyHours", "augustHours",
        "septemberHours", "octoberHours", "novemberHours",
        "decemberHours"
    ];

    for (const [index, key] of monthKeys.entries()) {
        const cell = totalRow.querySelector(`[data-idb-key="${key}"]`);
        if (!cell) return;

        const existingValue = cell.textContent.trim();
        //if (!existingValue) return;

        // Convert month index to yyyy-mm-01 for the function
        const year = document.getElementById("report-period").textContent;
        const month = (index + 1).toString().padStart(2, "0");
        const dateString = `${year}-${month}-01`;

        const calc = calculateMonthlyWorkHours(dateString, hoursPerWeekday);

        let emptyProjectHours = 0.0;
        const emptyProjectRecord = await getReportByProjectId(emptyProjectId);
        if (emptyProjectRecord)
            emptyProjectHours = emptyProjectRecord[key];

        const workingHours = existingValue - emptyProjectHours;
        const availableHours = calc - emptyProjectHours;
        const workingPct = (availableHours !== 0 ? workingHours / availableHours : 0);

        cell.textContent = `${Number(workingHours).toFixed(2)} / ${Number(availableHours).toFixed(2)} (${Number(workingPct * 100).toFixed(0)}%)`;
    }
}

function getReportByProjectId(projectId) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName);

        request.onsuccess = (event) => {
            const db = event.target.result;
            const tx = db.transaction("report", "readonly");
            const store = tx.objectStore("report");
            const index = store.index("projectId-idx");

            const query = index.get(projectId);

            query.onsuccess = () => {
                resolve(query.result);
            };

            query.onerror = () => reject(query.error);
        };

        request.onerror = () => reject(request.error);
    });
}