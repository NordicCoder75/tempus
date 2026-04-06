function updateTotal(td) {
    const tr = td.closest('tr')
    const totalCell = tr.querySelector("[data-idb-key='total']");
    if (totalCell) {
        const hourCells = tr.querySelectorAll("[data-idb-key$='Hours']");

        let sum = 0;
        hourCells.forEach(cell => {
            let val = parseFloat(cell.textContent.trim());
            if (!isNaN(val)) sum += val;
        });
        totalCell.textContent = sum.toFixed(2); // 2 decimals
    }
}

async function fetchDataForQuinyxExport() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName);

        request.onerror = (event) => reject("DB open error: " + event.target.error);

        request.onsuccess = async (event) => {
            const [indexName, indexValue] = await getEntityIndexAndValue("timesheet");

            const db = event.target.result;
            const tx = db.transaction(["timesheet", "setup"], "readonly");
            const timesheetStore = tx.objectStore("timesheet");
            const setupStore = tx.objectStore("setup");

            const result = {timesheet: [], setup: {}};

            // Setup: only one record
            setupStore.getAll().onsuccess = (e) => {
                if (e.target.result.length > 0) {
                    result.setup = e.target.result[0];
                }
            };

            const index = timesheetStore.index(indexName);
            const tsReq = index.getAll(indexValue);

            tsReq.onsuccess = (e) => {
                result.timesheet = e.target.result || [];
            };

            tx.oncomplete = () => resolve(result);
            tx.onerror = (err) => reject(err);
        };
    });
}

async function buildQuinyxExport(data) {
    const employeeId = data.setup["employeeId"] || "";
    const internalShift = data.setup["internalShift"] || "";
    const projectShift = data.setup["projectShift"] || "";

    const exportFormat = data.setup["exportFormat"] || "{employeeId}_{week}_{dateTime}.csv";
    const exportValues = {"employeeId": employeeId, "week": getWeekNumber(currentDay), "dateTime": formatDateLocal(new Date()) + 'T' + formatTimeLocal(new Date())};
    const exportFileName = exportFormat.replace(/{(.*?)}/g, (_, key) => exportValues[key] || "");

    let output = "";
    output += "FORMAT VERSION;2;;\n";
    output += `PERSON ID;${employeeId};;\n`;
    output += `INTERNAL TIME SHIFT;${internalShift};;\n`;
    output += `PROJECT TIME SHIFT;${projectShift};;\n`;
    output += ";;;\n";
    output += "DATE;PROJECT ID;HOURS;COMMENT\n";

    const days = [
        {hoursKey: "mondayHours", descKey: "mondayDesc"},
        {hoursKey: "tuesdayHours", descKey: "tuesdayDesc"},
        {hoursKey: "wednesdayHours", descKey: "wednesdayDesc"},
        {hoursKey: "thursdayHours", descKey: "thursdayDesc"},
        {hoursKey: "fridayHours", descKey: "fridayDesc"},
        {hoursKey: "saturdayHours", descKey: "saturdayDesc"},
        {hoursKey: "sundayHours", descKey: "sundayDesc"},
    ];

    for (const row of data.timesheet) {
        const {year, week, ["projectId"]: projectId} = row;
        days.forEach((day, i) => {
            const hours = row[day.hoursKey];
            if (projectId !== "" && hours && hours > 0) {
                const dateStr = getDateOfMondayOfISOWeek(week, year, i);
                const comment = row[day.descKey] || "";
                output += `${dateStr};${projectId};${hours};${comment}\n`;
            }
        });
    }

    return [exportFileName, output];
}

async function exportQuinyxData() {
    try {
        const data = await fetchDataForQuinyxExport();
        const [filename, formatted] = await buildQuinyxExport(data);
        const blob = new Blob([formatted], {type: "text/plain"});
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Export failed:", err);
    }
}

async function fetchDataForQuinyxImport(file) {
    const text = await file.text();
    const rows = await buildQuinyxImport(text);

    try {
        const db = await openDB();
        const tx = db.transaction("timesheet", "readwrite");
        const store = tx.objectStore("timesheet");

        rows.forEach(row => store.put(row));

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(rows);
            tx.onerror = (err) => reject("Transaction failed: " + err.target.error);
        });
    } catch (err) {
        console.error("Import failed:", err);
        throw err;
    }
}

async function buildQuinyxImport(content) {
    const lines = content.trim().split(/\r?\n/);

    const headerIndex = lines.findIndex(l => l.startsWith("DATE;PROJECT ID;HOURS;COMMENT"));
    if (headerIndex === -1) throw new Error("Invalid file format: no DATE header found.");

    const dataLines = lines.slice(headerIndex + 1);
    const rows = [];

    for (const line of dataLines) {
        if (!line.trim()) continue;
        const [dateStr, projectId, hoursStr, comment] = line.split(";");

        const date = new Date(dateStr);
        const year = String(getWeekYearNumber(date));
        const week = String(getWeekNumber(date));

        // weekday prefix
        const weekday = date.getUTCDay();
        const map = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const prefix = map[weekday];

        // Try to find an existing row with same keys+desc
        let existing = rows.find(r =>
            r.year === year &&
            r.week === week &&
            r["projectId"] === projectId &&
            r._mergeKey === comment &&
            r[`${prefix}Hours`] === "" && // unused day
            r[`${prefix}Desc`] === ""
        );

        if (!existing) {
            existing = {
                year,
                week,
                "projectId": projectId,
                "projectName": "",
                _mergeKey: comment, // internal merge key, not stored
                "mondayHours": "", "mondayDesc": "",
                "tuesdayHours": "", "tuesdayDesc": "",
                "wednesdayHours": "", "wednesdayDesc": "",
                "thursdayHours": "", "thursdayDesc": "",
                "fridayHours": "", "fridayDesc": "",
                "saturdayHours": "", "saturdayDesc": "",
                "sundayHours": "", "sundayDesc": ""
            };
            rows.push(existing);
        }

        existing[`${prefix}Hours`] = hoursStr || "";
        existing[`${prefix}Desc`] = comment || "";
    }

    // Add project name where applicable
    const favorites = await getIndexedRecords("favorites");
    for (let row of rows) {
        const dbRow = favorites.find(f => f.value.projectId === row.projectId);
        if (dbRow?.value?.projectName) {
            row.projectName = dbRow.value.projectName;
        }
    }

    // Strip internal merge key
    rows.forEach(r => delete r._mergeKey);

    return rows;
}

async function importQuinyxData() {
    // Create a hidden file input on the fly
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.txt"; // limit to CSV or text files
    input.multiple = true;      // allow multiple file selection
    input.style.display = "none";

    // Handle file selection
    input.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        try {
            // Process all selected files one by one
            for (const file of files) {
                await fetchDataForQuinyxImport(file);
            }

            // Refresh
            const table = document.getElementById("timesheet");
            if (table) {
                document.querySelector(`a[data-page="partials/timesheet.html"]`).click();
            }
        } catch (err) {
            console.error("Import failed:", err);
        }
    });

    // Trigger the file picker
    document.body.appendChild(input);  // required for Firefox
    input.click();

    // Cleanup afterward
    input.remove();
}