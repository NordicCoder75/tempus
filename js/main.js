import { initDatabase } from "./tools/db-tools.js";
import { initMenu } from "./menu.js";

const overlay = document.getElementById("overlay");
const loginButton = document.getElementById("loginBtn");

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await initDatabase();
        initMenu({
            overlay,
            loginButton
        });
    } catch (error) {
        console.error("Failed to initialize Tempus:", error);
    }
});
