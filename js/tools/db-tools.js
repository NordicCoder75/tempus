import {
    DB_NAME,
    DB_VERSION,
    TIMESHEET_STORE_NAME,
    SETUP_STORE_NAME,
    WORK_WEEK_STORE_NAME,
    FAVORITES_STORE_NAME,
    YEAR_WEEK_INDEX_NAME,
    PROJECT_ID_INDEX_NAME
} from "../config.js";

let dbTools = null;

export function initDatabase() {
    if (dbTools) {
        return Promise.resolve(dbTools);
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = event => {
            dbTools = event.target.result;

            if (!dbTools.objectStoreNames.contains(TIMESHEET_STORE_NAME)) {
                const store = dbTools.createObjectStore(TIMESHEET_STORE_NAME, {
                    keyPath: "id",
                    autoIncrement: true
                });

                store.createIndex(YEAR_WEEK_INDEX_NAME, ["year", "week"], { unique: false });
                store.createIndex(PROJECT_ID_INDEX_NAME, "projectId", { unique: false });
            }

            if (!dbTools.objectStoreNames.contains(FAVORITES_STORE_NAME)) {
                const store = dbTools.createObjectStore(FAVORITES_STORE_NAME, {
                    keyPath: "id",
                    autoIncrement: true
                });

                store.createIndex(PROJECT_ID_INDEX_NAME, "projectId", { unique: false });
            }

            if (!dbTools.objectStoreNames.contains(WORK_WEEK_STORE_NAME)) {
                dbTools.createObjectStore(WORK_WEEK_STORE_NAME, {
                    keyPath: "id",
                    autoIncrement: true
                });
            }

            if (!dbTools.objectStoreNames.contains(SETUP_STORE_NAME)) {
                dbTools.createObjectStore(SETUP_STORE_NAME, {
                    keyPath: "id",
                    autoIncrement: true
                });
            }
        };

        request.onsuccess = event => {
            dbTools = event.target.result;
            console.log(`IndexedDB initialized: ${DB_NAME} v${dbTools.version}`);
            resolve(dbTools);
        };

        request.onerror = event => {
            reject(event.target.error);
        };
    });
}

export function saveRow(storeName, row) {
    return withStore(storeName, "readwrite", store => {
        const data = normalizeRow(row);

        if (!data.id) {
            delete data.id;
        }

        return requestToPromise(store.put(data));
    });
}

export function loadRows(storeName, indexName, ...keyValues) {
    return withStore(storeName, "readonly", store => {
        if (indexName) {
            return requestToPromise(getAllFromIndex(store.index(indexName), keyValues));
        }

        return requestToPromise(store.getAll());
    });
}

export function deleteRow(storeName, id) {
    return withStore(storeName, "readwrite", store => {
        return requestToPromise(store.delete(id)).then(() => undefined);
    });
}

export function storeExists(storeName) {
    return ensureDatabase().objectStoreNames.contains(storeName);
}

export function listStoreNames() {
    return Array.from(ensureDatabase().objectStoreNames);
}

export function saveImportedRecord(storeName, record) {
    return new Promise((resolve, reject) => {
        const database = ensureDatabase();
        const tx = database.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);

        const data = { ...record };
        const hasId = Object.hasOwn(data, "id");
        const id = data.id;

        if (!hasId || id === null || id === undefined || id === "") {
            delete data.id;

            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = event => reject(event.target.error);
            return;
        }

        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
            if (getRequest.result !== undefined) {
                data.id = id;

                const putRequest = store.put(data);
                putRequest.onsuccess = () => resolve(putRequest.result);
                putRequest.onerror = event => reject(event.target.error);
            } else {
                delete data.id;

                const addRequest = store.add(data);
                addRequest.onsuccess = () => resolve(addRequest.result);
                addRequest.onerror = event => reject(event.target.error);
            }
        };

        getRequest.onerror = event => reject(event.target.error);
    });
}

export function normalizeRow(row) {
    const hourFields = [
        "mondayHours",
        "tuesdayHours",
        "wednesdayHours",
        "thursdayHours",
        "fridayHours",
        "saturdayHours",
        "sundayHours",
        "totalHours"
    ];

    const data = { ...row };

    hourFields.forEach(field => {
        if (Object.hasOwn(data, field)) {
            if (data[field] === "" || data[field] == null) {
                data[field] = null;
            } else {
                data[field] = Number(data[field]);
            }
        }
    });

    if (Object.hasOwn(data, "week")) {
        data.week = Number(data.week);
    }

    if (Object.hasOwn(data, "year")) {
        data.year = Number(data.year);
    }

    return data;
}

export async function deleteDatabase({ dbName = DB_NAME } = {}) {
    if (dbTools) {
        dbTools.close();
        dbTools = null;
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);

        request.onsuccess = () => {
            console.log(`${dbName} deleted successfully.`);
            resolve();
        };

        request.onerror = () => reject(request.error);

        request.onblocked = () => {
            reject(new Error(`Delete blocked for ${dbName}. Close other tabs using this database.`));
        };
    });
}

export function createTimesheetRow(year, week, projectId, projectName) {
    return {
        year,
        week,
        projectId,
        projectName,
        mondayHours: null,
        mondayDesc: "",
        tuesdayHours: null,
        tuesdayDesc: "",
        wednesdayHours: null,
        wednesdayDesc: "",
        thursdayHours: null,
        thursdayDesc: "",
        fridayHours: null,
        fridayDesc: "",
        saturdayHours: null,
        saturdayDesc: "",
        sundayHours: null,
        sundayDesc: "",
        totalHours: null
    };
}

function ensureDatabase() {
    if (!dbTools) {
        throw new Error("IndexedDB has not been initialized.");
    }

    return dbTools;
}

function withStore(storeName, mode, operation) {
    const database = ensureDatabase();
    const tx = database.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    return operation(store);
}

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = event => reject(event.target.error);
    });
}

function getAllFromIndex(index, keyValues) {
    if (keyValues.length === 0) {
        return index.getAll();
    }

    if (keyValues.length === 1) {
        return index.getAll(keyValues[0]);
    }

    return index.getAll(keyValues);
}
