window.SetupPage = {
    async init() {
        await loadSections("setup");

        await loadTable("favorites");
    }
};