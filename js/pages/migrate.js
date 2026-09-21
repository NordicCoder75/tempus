const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const exportButton = document.getElementById("exportButton");
const status = document.getElementById("status");

let importedJson = null;
let importedFileName = "indexeddb-export";

dropZone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", event => {
    if (event.target.files.length > 0) {
        loadFile(event.target.files[0]);
    }
});

["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        dropZone.classList.add("dragover");
    });
});

["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        dropZone.classList.remove("dragover");
    });
});

dropZone.addEventListener("drop", event => {
    const file = event.dataTransfer.files[0];

    if (file) {
        loadFile(file);
    }
});

async function loadFile(file) {
    try {
        status.className = "";
        status.textContent = "Reading JSON file...";
        exportButton.disabled = true;

        const text = await file.text();
        const json = JSON.parse(text);

        if (!json.objectStores || typeof json.objectStores !== "object") {
            throw new Error('Invalid format. Expected an "objectStores" object at the root.');
        }

        importedJson = json;
        importedFileName = file.name.replace(/\.json$/i, "");

        const stores = Object.entries(json.objectStores);
        const summary = stores
            .map(([name, store]) => {
                const rowCount = Array.isArray(store.data) ? store.data.length : 0;
                return `${name}: ${rowCount} rows`;
            })
            .join("\n");

        status.className = "success";
        status.textContent =
            `Loaded ${file.name}\n\n` +
            `${stores.length} object store(s):\n${summary}`;

        exportButton.disabled = false;
    } catch (error) {
        importedJson = null;
        exportButton.disabled = true;
        status.className = "error";
        status.textContent = `Error: ${error.message}`;
    }
}

exportButton.addEventListener("click", () => {
    try {
        if (!importedJson) {
            throw new Error("Please select a JSON file first.");
        }

        status.className = "";
        status.textContent = "Creating workbook and applying transformations...";
        exportButton.disabled = true;

        const workbook = createWorkbookFromJson(importedJson);
        const changes = [];

        transformTimesheet(workbook, changes);
        transformSetup(workbook, changes);
        removeReportSheet(workbook, changes);

        const outputName = `${importedFileName}-transformed.xlsx`;

        XLSX.writeFile(workbook, outputName, {
            bookType: "xlsx",
            compression: true
        });

        status.className = "success";
        status.textContent =
            "Workbook created and transformed successfully.\n\n" +
            changes.join("\n") +
            `\n\nCreated: ${outputName}`;
    } catch (error) {
        status.className = "error";
        status.textContent = `Export error: ${error.message}`;
    } finally {
        exportButton.disabled = !importedJson;
    }
});

function createWorkbookFromJson(json) {
    const workbook = XLSX.utils.book_new();

    for (const [storeName, store] of Object.entries(json.objectStores)) {
        const rows = Array.isArray(store.data) ? store.data : [];
        const headers = [];
        const seenHeaders = new Set();

        for (const row of rows) {
            if (row && typeof row === "object" && !Array.isArray(row)) {
                for (const key of Object.keys(row)) {
                    if (!seenHeaders.has(key)) {
                        seenHeaders.add(key);
                        headers.push(key);
                    }
                }
            }
        }

        const worksheet = XLSX.utils.json_to_sheet(rows, {
            header: headers,
            skipHeader: false
        });

        if (headers.length === 0) {
            XLSX.utils.sheet_add_aoa(worksheet, [["No data"]], { origin: "A1" });
        }

        worksheet["!cols"] = (headers.length ? headers : ["No data"]).map(header => ({
            wch: Math.min(Math.max(String(header).length + 2, 12), 50)
        }));

        const safeSheetName = sanitizeSheetName(storeName);

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            makeUniqueSheetName(workbook, safeSheetName)
        );
    }

    return workbook;
}

function findSheetName(workbook, expectedName) {
    return workbook.SheetNames.find(name => name.toLowerCase() === expectedName.toLowerCase());
}

function transformTimesheet(workbook, changes) {
    const sheetName = findSheetName(workbook, "timesheet");

    if (!sheetName) {
        changes.push("timesheet: sheet not found, skipped.");
        return;
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: ""
    });

    if (rows.length === 0) {
        changes.push("timesheet: empty sheet.");
        return;
    }

    const headers = rows[0].map(value => String(value));
    const keptIndexes = [];

    headers.forEach((header, index) => {
        if (header.toLowerCase() !== "total") {
            keptIndexes.push(index);
        }
    });

    const filteredRows = rows.map(row =>
        keptIndexes.map(index => row[index] ?? "")
    );

    const filteredHeaders = filteredRows[0];
    const numericColumnIndexes = new Set();

    filteredHeaders.forEach((header, index) => {
        const normalized = String(header).toLowerCase();

        if (normalized === "year" || normalized === "week" || /hours$/i.test(header)) {
            numericColumnIndexes.add(index);
        }
    });

    for (let rowIndex = 1; rowIndex < filteredRows.length; rowIndex++) {
        numericColumnIndexes.forEach(columnIndex => {
            filteredRows[rowIndex][columnIndex] = convertToNumber(filteredRows[rowIndex][columnIndex]);
        });
    }

    const newSheet = XLSX.utils.aoa_to_sheet(filteredRows);
    copyBasicSheetProperties(sheet, newSheet);
    workbook.Sheets[sheetName] = newSheet;

    changes.push("timesheet: converted year, week, and *Hours columns to numbers; removed total column.");
}

function transformSetup(workbook, changes) {
    const sheetName = findSheetName(workbook, "setup");

    if (!sheetName) {
        changes.push("setup: sheet not found, skipped.");
        return;
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: ""
    });

    if (rows.length === 0) {
        changes.push("setup: empty sheet.");
        return;
    }

    const originalHeaders = rows[0].map(value => String(value));

    const renameMap = {
        internalShift: "internalTimeShift",
        projectShift: "projectTimeShift"
    };

    const renamedHeaders = originalHeaders.map(header => renameMap[header] || header);

    const hourIndexes = [];
    const remainingIndexes = [];

    originalHeaders.forEach((header, index) => {
        if (/hours$/i.test(header)) {
            hourIndexes.push(index);
        } else {
            remainingIndexes.push(index);
        }
    });

    const setupRows = rows.map(row => remainingIndexes.map(index => row[index] ?? ""));
    setupRows[0] = remainingIndexes.map(index => renamedHeaders[index]);

    const workWeekRows = rows.map((row, rowIndex) =>
        hourIndexes.map(index => {
            const value = row[index] ?? "";
            return rowIndex === 0 ? value : convertToNumber(value);
        })
    );

    workWeekRows[0] = hourIndexes.map(index => renamedHeaders[index]);

    const newSetupSheet = XLSX.utils.aoa_to_sheet(setupRows);
    copyBasicSheetProperties(sheet, newSetupSheet);
    workbook.Sheets[sheetName] = newSetupSheet;

    const existingWorkWeek = findSheetName(workbook, "workWeek");

    if (existingWorkWeek) {
        deleteSheet(workbook, existingWorkWeek);
    }

    const workWeekSheet = XLSX.utils.aoa_to_sheet(workWeekRows);
    workbook.Sheets["workWeek"] = workWeekSheet;

    const setupIndex = workbook.SheetNames.indexOf(sheetName);
    workbook.SheetNames.splice(setupIndex + 1, 0, "workWeek");

    changes.push("setup: renamed internalShift and projectShift; moved *Hours columns to workWeek.");
}

function removeReportSheet(workbook, changes) {
    const sheetName = findSheetName(workbook, "report");

    if (!sheetName) {
        changes.push("report: sheet not found, skipped.");
        return;
    }

    deleteSheet(workbook, sheetName);
    changes.push("report: sheet removed.");
}

function deleteSheet(workbook, sheetName) {
    delete workbook.Sheets[sheetName];

    const index = workbook.SheetNames.indexOf(sheetName);
    if (index >= 0) {
        workbook.SheetNames.splice(index, 1);
    }
}

function convertToNumber(value) {
    if (value === null || value === undefined || value === "") {
        return "";
    }

    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "string") {
        const normalized = value.trim().replace(",", ".");

        if (normalized === "") {
            return "";
        }

        const number = Number(normalized);
        return Number.isFinite(number) ? number : value;
    }

    return value;
}

function copyBasicSheetProperties(source, target) {
    if (source["!cols"]) {
        target["!cols"] = source["!cols"];
    }

    if (source["!margins"]) {
        target["!margins"] = source["!margins"];
    }

    if (source["!autofilter"]) {
        target["!autofilter"] = source["!autofilter"];
    }
}

function sanitizeSheetName(name) {
    const sanitized = String(name)
        .replace(/[\\\/?*\[\]:]/g, "_")
        .substring(0, 31);

    return sanitized || "Sheet";
}

function makeUniqueSheetName(workbook, baseName) {
    let name = baseName;
    let counter = 1;

    while (workbook.SheetNames.includes(name)) {
        const suffix = `_${counter++}`;
        name = baseName.substring(0, 31 - suffix.length) + suffix;
    }

    return name;
}
