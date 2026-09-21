import {
    DB_NAME,
    IMPORTABLE_STORES
} from "../config.js";
import {
    deleteRow,
    loadRows,
    listStoreNames,
    saveImportedRecord,
    storeExists
} from "./db-tools.js";
import { openFile } from "./file-tools.js";

export async function exportToExcel() {
    await exportIndexedDbToExcel(DB_NAME);
}

export async function importFromExcel() {
    try {
        const file = await openFile(".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        await importExcelToIndexedDb(file, IMPORTABLE_STORES);
        await cleanEmptyRows();

        location.reload();
    } catch (error) {
        console.error("Excel import failed:", error);
    }
}

async function exportIndexedDbToExcel(dbName, fileName = `${dbName}.xlsx`) {
    const workbook = XLSX.utils.book_new();
    const storeNames = listStoreNames();

    for (const storeName of storeNames) {
        const records = await loadRows(storeName);
        const worksheet = records.length > 0
            ? XLSX.utils.json_to_sheet(records)
            : XLSX.utils.aoa_to_sheet([]);

        XLSX.utils.book_append_sheet(workbook, worksheet, storeName);
    }

    XLSX.writeFile(workbook, fileName);
}

async function cleanEmptyRows() {
    for (const storeName of Object.keys(IMPORTABLE_STORES)) {
        const rows = await loadRows(storeName);
        const columns = IMPORTABLE_STORES[storeName];

        const emptyRows = rows.filter(row => shouldDeleteRow(storeName, row, columns));
        await Promise.all(emptyRows.map(row => deleteRow(storeName, row.id)));
    }
}

function shouldDeleteRow(storeName, row, columns) {
    if (columns.every(column => isEmpty(row[column]))) {
        return true;
    }

    if (storeName === "timesheet") {
        const identityColumns = new Set(["year", "week", "projectId", "projectName"]);

        return columns
            .filter(column => !identityColumns.has(column))
            .every(column => isEmpty(row[column]));
    }

    return false;
}

function isEmpty(value) {
    return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

async function importExcelToIndexedDb(source, importableStores) {
    const arrayBuffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();

    const workbook = XLSX.read(arrayBuffer, {
        type: "array",
        cellDates: true
    });

    let imported = 0;
    let skippedSheets = 0;

    for (const sheetName of workbook.SheetNames) {
        const allowedFields = importableStores[sheetName];

        if (!allowedFields) {
            skippedSheets++;
            continue;
        }

        if (!storeExists(sheetName)) {
            skippedSheets++;
            continue;
        }

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
            defval: null,
            raw: true
        });

        if (rows.length === 0) {
            continue;
        }

        for (const row of rows) {
            await importRecord(sheetName, row, allowedFields);
            imported++;
        }
    }

    return { imported, skippedSheets };
}

async function importRecord(storeName, row, allowedFields) {
    const record = {};

    for (const field of allowedFields) {
        if (Object.hasOwn(row, field)) {
            record[field] = row[field];
        }
    }

    await saveImportedRecord(storeName, record);
}
