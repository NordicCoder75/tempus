async function insert_favorites() {
    const request = indexedDB.open(databaseName);

    request.onerror = (event) => reject("DB open error: " + event.target.error);

    request.onsuccess = async (event) => {
        const table = document.getElementById("timesheet");
        const tbody = table.tBodies[0];

        for (const tr of tbody.children) {
            if (isRowEmpty(tr)) {
                await deleteRecordByKey("timesheet", Number(tr.dataset.id));
                tbody.removeChild(tr);
            }
        }

        const db = event.target.result;
        const tx = db.transaction(["favorites"], "readonly");
        const favoritesStore = tx.objectStore("favorites");
        const tsReq = favoritesStore.getAll();

        tsReq.onsuccess = async (e) => {
            const favorites = e.target.result;

            for (const favorite of favorites) {
                if (favorite["projectId"].trim() !== "" || favorite["projectName"].trim() !== "") {

                    const row = await createRowFromModel("timesheet", true);

                    row.querySelector('[data-idb-key="projectId"]').textContent = favorite["projectId"];
                    row.querySelector('[data-idb-key="projectName"]').textContent = favorite["projectName"];
                    tbody.appendChild(row);

                    await updateRecordByKey("timesheet", Number(row.dataset.id), row);
                }
            }

            // Insert new blank row at the end
            const row = await createRowFromModel("timesheet", true);
            tbody.appendChild(row);
        };
    };
}

async function insert_danish_holidays() {
    const input = prompt("Enter year:", getWeekYearNumber(new Date()).toString());

    const year = Number(input);

    if (!year || isNaN(year) || year < 1) {
        alert("Invalid year");
    } else {
        const holidays = getDanishHolidays(year);

        const setup = await getRecordByKey('setup', 1);

        for (const [holidayName, holidayDate] of Object.entries(holidays)) {
            const week = getWeekNumber(holidayDate);
            const weekdayName = getWeekdayName(holidayDate);
            const weekdayHours = Number(setup[weekdayName]);

            const row = await createRowFromModel("timesheet", true);
            row.querySelector('[data-idb-key="year"]').textContent = year;
            row.querySelector('[data-idb-key="week"]').textContent = week;
            row.querySelector('[data-idb-key="projectId"]').textContent = "";
            row.querySelector('[data-idb-key="projectName"]').textContent = holidayName;
            row.querySelector('[data-idb-key="' + weekdayName + '"]').textContent = weekdayHours;
            await updateRecordByKey("timesheet", Number(row.dataset.id), row);

            console.log(holidayName + ':' + holidayDate + ':' + 7.4);
        }
    }
}

//
async function export_week_quinyx() {
    await exportQuinyxData();
}

async function import_week_quinyx() {
    await importQuinyxData();
}

async function clear_db() {
    if (!confirm("This will permanently delete all data.\n\nAre you sure?")) {
        return;
    }

    const deleteRequest = await indexedDB.deleteDatabase(databaseName);

    deleteRequest.addEventListener("success", () => {
        console.log("Database deleted successfully.");
    });

    deleteRequest.addEventListener("error", event => {
        console.error("Error deleting database:", event.target.error);
    });

    deleteRequest.addEventListener("blocked", () => {
        console.warn("Delete blocked: Please close all other tabs using this database.");
    });

    location.reload();
}

async function export_db() {
    const backup = await exportIndexedDB(databaseName);
    downloadIndexedDBBackup(backup);
}

async function import_db() {
    if (confirm("This will overwrite any existing data.\n\nAre you sure?")) {
        const backup = await uploadJSONFile();
        showLoader();
        await importIndexedDB(backup);
        hideLoader();

        location.reload();
    }
}
