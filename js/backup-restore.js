//=====================================================================
// IndexedDB Backup Utility
// Export to file  |  Import from file  |  Recreates DB structure + data
//=====================================================================

//------------------------------------------------------
// EXPORT: read IndexedDB and return a full backup object
//------------------------------------------------------
async function exportIndexedDB(dbName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error);

        request.onsuccess = async () => {
            const db = request.result;
            const exportObj = {
                name: db.name,
                version: db.version,
                objectStores: {}
            };

            const tx = db.transaction(db.objectStoreNames, "readonly");

            for (const storeName of db.objectStoreNames) {
                const store = tx.objectStore(storeName);
                const storeExport = {
                    keyPath: store.keyPath,
                    autoIncrement: store.autoIncrement,
                    indexes: {},
                    data: []
                };

                // Index metadata
                for (const idxName of store.indexNames) {
                    const idx = store.index(idxName);
                    storeExport.indexes[idxName] = {
                        keyPath: idx.keyPath,
                        unique: idx.unique,
                        multiEntry: idx.multiEntry
                    };
                }

                // Export data
                storeExport.data = await new Promise((res, rej) => {
                    const result = [];
                    const cursorReq = store.openCursor();

                    cursorReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            result.push(cursor.value);
                            cursor.continue();
                        } else {
                            res(result);
                        }
                    };
                    cursorReq.onerror = () => rej(cursorReq.error);
                });

                exportObj.objectStores[storeName] = storeExport;
            }

            resolve(exportObj);
        };
    });
}

//------------------------------------------------------
// DOWNLOAD: save backup object to a JSON file
//------------------------------------------------------
function downloadIndexedDBBackup(backup) {
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${backup.name}.json`;
    a.click();

    URL.revokeObjectURL(a.href);
}

//------------------------------------------------------
// EXPORT WRAPPER: export and download file in one call
//------------------------------------------------------
async function exportIndexedDBToFile(dbName) {
    const backup = await exportIndexedDB(dbName);
    downloadIndexedDBBackup(backup);
}

//------------------------------------------------------
// IMPORT: load JSON file via file picker
//------------------------------------------------------
function uploadJSONFile() {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";

        input.onchange = () => {
            const file = input.files[0];
            if (!file) return reject("No file selected");

            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onload = () => {
                try {
                    resolve(JSON.parse(reader.result));
                } catch (e) {
                    reject(e);
                }
            };

            reader.readAsText(file);
        };

        input.click();
    });
}


//------------------------------------------------------
// IMPORT: recreate DB structure + indexes + data
//------------------------------------------------------
async function importIndexedDB(backupObj) {
    return new Promise((resolve, reject) => {
        const deleteReq = indexedDB.deleteDatabase(backupObj.name);

        deleteReq.onerror = () => reject(deleteReq.error);

        deleteReq.onsuccess = () => {
            const openReq = indexedDB.open(backupObj.name, backupObj.version);

            openReq.onupgradeneeded = () => {
                const db = openReq.result;

                // Create stores + indexes
                for (const [storeName, storeInfo] of Object.entries(backupObj.objectStores)) {
                    const store = db.createObjectStore(storeName, {
                        keyPath: storeInfo.keyPath,
                        autoIncrement: storeInfo.autoIncrement
                    });

                    for (const [idxName, idxInfo] of Object.entries(storeInfo.indexes)) {
                        store.createIndex(idxName, idxInfo.keyPath, {
                            unique: idxInfo.unique,
                            multiEntry: idxInfo.multiEntry
                        });
                    }
                }
            };

            openReq.onerror = () => reject(openReq.error);

            openReq.onsuccess = () => {
                const db = openReq.result;

                const tx = db.transaction(db.objectStoreNames, "readwrite");
                tx.onerror = () => reject(tx.error);
                tx.oncomplete = () => resolve(true);

                // Insert all data
                for (const [storeName, storeInfo] of Object.entries(backupObj.objectStores)) {
                    const store = tx.objectStore(storeName);
                    for (const record of storeInfo.data) {
                        store.add(record);
                    }
                }
            };
        };
    });
}

//------------------------------------------------------
// IMPORT WRAPPER: file picker -> import into IndexedDB
//------------------------------------------------------
async function importIndexedDBFromFile() {
    const backup = await uploadJSONFile();
    await importIndexedDB(backup);
    return true;
}
