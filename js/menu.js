import { deleteDatabase } from "./tools/db-tools.js";
import { importFromExcel as importExcelData, exportToExcel as exportExcelData } from "./tools/excel-tools.js";
import { initTimesheet, insertTimesheetFavorites } from "./timesheet.js";
import { openModalWindow } from "./tools/window-manager.js";
import {exportToQuinyx as exportQuinyxData, importFromQuinyx as importQuinyxData} from "./tools/quinyx-tools.js";

let menuInitialized = false;
let loggedIn = false;

export function initMenu({ overlay, loginButton } = {}) {
    if (menuInitialized) {
        return;
    }

    menuInitialized = true;

    const actions = {
        openTimesheet() {
            initTimesheet({ overlay }).catch(error => {
                console.error("Failed to initialize timesheet:", error);
            });
        },

        async insertFavorites() {
            await insertTimesheetFavorites({ overlay });
        },

        async importFromQuinyx() {
                await importQuinyxData();
        },

        async exportToQuinyx() {
            await exportQuinyxData();
        },

        async importFromExcel() {
            await importExcelData();
        },

        async exportToExcel() {
            await exportExcelData();
        },

        showReport() {
            openModalWindow("report", { overlay });
        },

        insertHolidays() {
            openModalWindow("holidays", { overlay });
        },

        showSetup() {
            openModalWindow("setup", { overlay });
        },

        showAbout() {
            openModalWindow("about", { overlay });
        },

        migrateDatabase() {
            openModalWindow("migrate", { overlay });
        },

        async clearDatabase() {
            if (!confirm("This will permanently delete all data.\n\nAre you sure?")) {
                return;
            }

            try {
                await deleteDatabase();
                location.reload();
            } catch (error) {
                console.error("Database reset failed:", error);
            }
        },

        doLogin() {
            loggedIn = !loggedIn;

            if (loginButton) {
                loginButton.textContent = loggedIn ? "Logout" : "Login";
            }
        }
    };

    document.querySelectorAll(".menu-button").forEach(button => {
        const menu = button.parentElement;
        const dropdown = menu?.querySelector?.(".dropdown");

        button.addEventListener("click", event => {
            event.stopPropagation();

            const action = button.dataset.action;

            if (action && actions[action]) {
                actions[action]();
                return;
            }

            if (!dropdown) {
                return;
            }

            const open = menu.classList.contains("open");

            document.querySelectorAll(".menu").forEach(item => {
                item.classList.remove("open");
            });

            if (!open) {
                menu.classList.add("open");
            }
        });
    });

    document.querySelectorAll(".data-menu-item[data-action]").forEach(item => {
        item.addEventListener("click", event => {
            event.stopPropagation();

            const action = item.dataset.action;

            if (actions[action]) {
                actions[action]();
            }

            document.querySelectorAll(".menu").forEach(menu => {
                menu.classList.remove("open");
            });
        });
    });

    document.addEventListener("click", () => {
        document.querySelectorAll(".menu").forEach(menu => {
            menu.classList.remove("open");
        });
    });
}
