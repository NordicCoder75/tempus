async function loadTable(entityName, insertEmptyRow = true, functionName = null) {
    try {
        const table = document.getElementById(entityName);
        const tbody = table.tBodies[0];

        tbody.innerHTML = "";

        const records = await getIndexedRecords(entityName);

        for (const record of records) {
            let row = await createRowFromModel(entityName, false);
            row.dataset.id = record.key;

            await updateRowFromRecord(row, record);

            // Call any row functions provided
            if (typeof functionName === "function") {
                await functionName(entityName, row);
            }

            if (isRowEmpty(row)) {
                await deleteRecordByKey(entityName, record.key);
            } else {
                tbody.appendChild(row);

                // Add extendability functions
                if (typeof window.onAfterLoadTableRow === "function") {
                    await window.onAfterLoadTableRow(row);
                }
            }
        }

        if (insertEmptyRow) {
            const lastRow = tbody.querySelector("tr:last-child");

            if (tbody.rows.length === 0 || !isRowEmpty(lastRow)) {
                let row = await createRowFromModel(entityName, true);

                // Call any row functions provided
                if (typeof functionName === "function") {
                    await functionName(entityName, row);
                }

                tbody.appendChild(row);
            }
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadSections(entityName) {
    try {
        let record = await getRecordByKey(entityName, 1); // Await the promise

        if (!record) {
            const json = makeJsonFromSection(entityName);
            const key = await createRecordFromJson(entityName, json);

            if (key !== 1) {
                console.error("Section keys must always be 1 on entity: " + entityName);
                return;
            }

            record = await getRecordByKey(entityName, key);
        }

        const sections = document.body.querySelectorAll(`[data-idb-store="${entityName}"]`);
        sections.forEach(section => {
            const elements = section.querySelectorAll("[data-idb-key]");

            elements.forEach(element => {
                inputOnChangedEvent(element); // Add event listener
                if (element.dataset.idbKey && record[element.dataset.idbKey] !== undefined) {
                    element.value = record[element.dataset.idbKey];
                }
            });
        });
    } catch (err) {
        console.error(err);
    }
}

async function createRowFromModel(entityName, createRecord) {
    try {
        // Load the JSON file
        const response = await fetch(`models/${entityName}.json`);
        if (!response.ok) {
            console.error("Failed to load json file:", entityName);
            return;
        }

        const json = await response.json();

        let newKey = 0;
        if (createRecord) {
            newKey = await createRecordFromJson(entityName, json);
        }

        let updateDB = false;

        // Create a new row
        const tr = document.createElement("tr");
        tr.dataset.id = String(newKey);

        // For each definition in the JSON, create a <td>
        for (const attributes of json.fields) {
            const td = document.createElement("td");

            // Apply all attributes from JSON
            for (const [key, value] of Object.entries(attributes)) {
                td.setAttribute(key, String(value));

                // Now we apply any data-method value the model may have, and trigger an update of the record in db
                if (key === "data-method" && typeof window[value] === "function") {
                    const anyValue = await window[value]();
                    td.textContent = String(anyValue);

                    updateDB = true;
                }
            }

            cellOnChangedEvent(td);
            tr.appendChild(td);
        }

        if (updateDB && createRecord) {
            await updateRecordByKey(entityName, newKey, tr);
        }

        return tr;
    } catch (err) {
        console.error("Error creating row:", err);
    }
}

async function updateRowFromRecord(row, record) {
    const cells = row.querySelectorAll("td");

    for (let cell of cells) {
        const fieldName = cell.getAttribute("data-idb-key");
        if (fieldName && record.value[fieldName] !== undefined) {
            cell.textContent = record.value[fieldName];
        }
    }
}

function isRowEmpty(tr) {
    const cells = tr.querySelectorAll('td[contenteditable="true"]');

    for (const cell of cells) {
        const text = cell.textContent.trim();

        if (text !== "") {
            return false;
        }
    }

    return true;
}

// Gets the entity's model's index and current value
async function getEntityIndexAndValue(entityName) {
    let indexName = "";
    let indexValue = [];

    const json = await loadJSON(entityName);
    if (json) {
        const primaryIndex = json.index.find(idx => idx.primary === true);
        if (primaryIndex) {
            indexName = primaryIndex.name;
            const methodFields = json.fields.filter(field => field["data-method"] && typeof window[field["data-method"]] === "function");
            for (const methodField of methodFields) {
                const anyValue = await window[methodField["data-method"]]();
                indexValue.push(String(anyValue));
            }
        }
    }

    return [indexName, indexValue];
}

//
function cellOnChangedEvent(cell) {
    if (cell._cellOnChangedEventHandlers) return;

    let originalValue = "";

    const focusHandler = e => {
        const td = e.target;
        originalValue = td.textContent.trim();
    };

    // Update database when leaving field
    const blurHandler = async e => {
        const td = e.target;
        const entityName = td.closest("table[data-idb-store]")?.getAttribute("data-idb-store");
        const key = Number(td.closest("tr[data-id]")?.getAttribute("data-id"));

        const newValue = td.textContent.trim();

        if (newValue !== originalValue) {
            const colName = td.getAttribute("data-idb-key");

            await updateRecordFieldByKey(entityName, key, colName, newValue);
        }

        // Delete empty row
        const tr = td.closest("tr");
        const tbody = tr.closest('tbody');

        if (isRowEmpty(tr) && tr !== tbody.querySelector("tr:last-child")) {
            const record = await getRecordByKey(entityName, key);
            if (!record) return; // record is already deleted (the blur fires twice on deletion)

            await deleteRecordByKey(entityName, key);

            document.querySelector(`a[data-page="partials/${entityPageMapping(entityName)}.html"]`).click();
        }
    };

    // If input in last row, insert next row (and enforce numeric check on any input
    const inputHandler = async e => {
        const td = e.target;

        if (td.getAttribute("type") === "number") {
            let originalValue = td.textContent.trim();

            originalValue = normalizeNumberText(originalValue);

            // Preserve cursor position (basic approach)
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const pos = range.startOffset;

            td.textContent = originalValue;

            // Restore cursor (best-effort)
            const newRange = document.createRange();
            newRange.setStart(td.firstChild || td, Math.min(pos, originalValue.length));
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }

        await handleLastRow(td);
    };

    const pasteHandler = async e => {
        const td = e.target.closest('td[contenteditable="true"]');
        if (!td) return;

        e.preventDefault();

        let text = e.clipboardData.getData("text/plain");
        text = text
            .replace(/\u00A0/g, " ") // convert non-breaking spaces
            .trim();                                       // remove leading/trailing spaces

        if (td.getAttribute("type") === "number") {
            text = normalizeNumberText(text);
        }

        // Insert plain text at cursor
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        selection.deleteFromDocument();
        selection.getRangeAt(0).insertNode(document.createTextNode(text));

        // Move cursor to end of inserted text
        selection.collapseToEnd();

        await handleLastRow(td);
    }

    cell.addEventListener("focus", focusHandler);
    cell.addEventListener("blur", blurHandler);
    cell.addEventListener("input", inputHandler);
    cell.addEventListener("paste", pasteHandler);

    // Add extendability functions
    if (typeof window.onAfterCellOnChangedEvent === "function") {
        window.onAfterCellOnChangedEvent(cell);
    }

    cell._cellOnChangedEventHandlers = {
        focusHandler,
        blurHandler,
        inputHandler,
        pasteHandler
    }
}

async function handleLastRow(td) {
    const tr = td.closest('tr');

    if (!isRowEmpty(tr)) {
        const tbody = tr.closest('tbody');

        if (
            tr === tbody.querySelector("tr:last-child") &&
            !tr.dataset.rowAdded
        ) {
            tr.dataset.rowAdded = "true";

            const entityName = tbody.closest("table[data-idb-store]")
                ?.getAttribute("data-idb-store");

            const row = await createRowFromModel(entityName, true);
            tbody.appendChild(row);
        }
    }
}

function normalizeNumberText(text) {
    text = text.replace(/,/g, '.');
    text = text.replace(/[^0-9.]/g, '');

    const parts = text.split('.');
    if (parts.length > 2) {
        text = parts[0] + '.' + parts.slice(1).join('');
    }

    return text;
}

// TODO: This needs to come from a json file
function entityPageMapping(entityName) {
    switch (entityName) {
        case "favorites" :
            return "setup";
        default:
            return entityName;
    }
}

async function loadJSON(entityName) {
    try {
        const response = await fetch(`models/${entityName}.json`);
        if (!response.ok) {
            console.error("Network error: " + response.statusText);
            return null;
        }
        return await response.json(); // JS object
    } catch (error) {
        console.error("Error loading JSON:", error);
    }
}

// Creates a JSON object from a section's 'data-idb-key'-fields
function makeJsonFromSection(entityName) {
    let fields = [];

    const sections = document.body.querySelectorAll(`[data-idb-store="${entityName}"]`);
    sections.forEach(section => {
        const elements = section.querySelectorAll("[data-idb-key]");

        elements.forEach(element => {
            fields.push({"data-idb-key": element.getAttribute("data-idb-key")});
        });
    })

    return {"index": [], "fields": fields};
}

function inputOnChangedEvent(input) {
    let originalValue = "";

    input.addEventListener("focus", () => {
        originalValue = input.value.trim();  // ✅ use value
    });

    input.addEventListener("blur", async () => {
        const newValue = input.value.trim();  // ✅ use value

        if (newValue !== originalValue) {
            const colName = input.getAttribute("data-idb-key");
            const entityName = input.closest("[data-idb-store]")?.getAttribute("data-idb-store");
            const key = Number(input.closest("[data-id]")?.getAttribute("data-id"));

            // Make sure this function exists and works as expected
            await updateRecordFieldByKey(entityName, key, colName, newValue);
        }
    });
}

/*
 * DATABASE functions
 */

async function openDB() {
    // 1. Load list of stores
    const entitiesRes = await fetch("models/entities.json");
    const storeNames = await entitiesRes.json();

    // 2. Try opening current DB
    let db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });

    // 3. Check missing stores
    const missing = storeNames.filter(name => !db.objectStoreNames.contains(name));
    if (missing.length === 0) {
        return db; // All good
    }

    // 4. Load schemas for missing stores
    const schemas = {};
    for (const name of missing) {
        try {
            const res = await fetch(`models/${name}.json`);
            if (res.ok) {
                schemas[name] = await res.json();
            } else {
                console.warn(`No schema file for ${name} (status ${res.status})`);
            }
        } catch (err) {
            console.error(`Error fetching schema for ${name}:`, err);
        }
    }

    // 5. Close and reopen with bumped version
    const newVersion = db.version + 1;
    db.close();

    db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, newVersion);

        request.onupgradeneeded = (e) => {
            const upgradeDB = e.target.result;

            for (const name of missing) {
                if (!upgradeDB.objectStoreNames.contains(name)) {
                    const store = upgradeDB.createObjectStore(name, {autoIncrement: true});

                    const json = schemas[name];
                    if (json?.index) {
                        json.index.forEach((idx) => {
                            store.createIndex(idx.name,
                                idx.fields.length === 1 ? idx.fields[0] : idx.fields,
                                {unique: idx.unique});
                        });
                    }
                }
            }
        };

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });

    return db;
}

// Small helper to promisify IDB requests
function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get records by optional index
async function getIndexedRecords(entityName, useIndexValue = "") {
    let [indexName, indexValue] = await getEntityIndexAndValue(entityName);
    if (useIndexValue !== "") {
        indexValue = [String(useIndexValue)];
    }

    const db = await openDB();
    const transaction = db.transaction(entityName, "readonly");
    const store = transaction.objectStore(entityName);

    let request;
    if (indexName && indexValue?.length > 0) {
        const index = store.index(indexName);
        request = index.openCursor(IDBKeyRange.only(indexValue));
    } else {
        request = store.openCursor();
    }

    return new Promise((resolve, reject) => {
        const result = [];
        request.onerror = (event) => reject(event.target.error);
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                result.push({key: cursor.primaryKey, value: cursor.value});
                cursor.continue();
            } else {
                resolve(result);
            }
        };
    });
}

// Create new record from JSON schema
async function createRecordFromJson(entityName, json) {
    const db = await openDB();
    const transaction = db.transaction(entityName, "readwrite");
    const store = transaction.objectStore(entityName);

    const record = {};
    json.fields.forEach(attributes => {
        if (attributes["data-idb-key"]) {
            record[attributes["data-idb-key"]] = "";
        }
    });

    const request = store.add(record);
    return await promisifyRequest(request); // resolves with new key
}

// Update a full record from a row
async function updateRecordByKey(entityName, key, row) {
    const db = await openDB();
    const transaction = db.transaction(entityName, "readwrite");
    const store = transaction.objectStore(entityName);

    const record = await promisifyRequest(store.get(key));
    if (!record) {
        throw new Error(`No record found for key: ${key}`);
    }

    row.querySelectorAll("[data-idb-key]").forEach(el => {
        record[el.dataset.idbKey] = el.textContent.trim();
    });

    const putRequest = store.put(record, key);
    await promisifyRequest(putRequest);
}

// Update a single field in an entity
async function updateRecordFieldByKey(entityName, key, fieldName, newValue) {
    const db = await openDB();
    const transaction = db.transaction(entityName, "readwrite");
    const store = transaction.objectStore(entityName);

    const record = await promisifyRequest(store.get(key));
    if (!record) {
        throw new Error(`No record found for key: ${key}`);
    }

    record[fieldName] = newValue;

    const putRequest = store.put(record, key);
    await promisifyRequest(putRequest);
}

// Delete record by key
async function deleteRecordByKey(entityName, key) {
    const db = await openDB();
    const transaction = db.transaction(entityName, "readwrite");
    const store = transaction.objectStore(entityName);

    const deleteRequest = store.delete(key);
    await promisifyRequest(deleteRequest);
}

//
async function getRecordByKey(entityName, key) {
    const db = await openDB();
    const transaction = db.transaction(entityName, "readonly");
    const store = transaction.objectStore(entityName);

    return new Promise((resolve, reject) => {
        const request = store.get(key);

        request.onerror = (event) => {
            reject(event.target.error);
        };

        request.onsuccess = () => {
            resolve(request.result); // Will be `undefined` if not found
        };
    });
}
