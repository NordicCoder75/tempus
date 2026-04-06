const databaseName = "TempusDB";

window.onload = async function () {
    showLoader();

    hideMenuItemGroup("timesheet");

    await openDB();
    hideLoader();
};

// Toggle dropdowns on click
document.querySelectorAll('.main-dropdown-toggle').forEach(toggle => {
    toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        const dropdown = this.nextElementSibling;
        document.querySelectorAll('.main-dropdown-content').forEach(dc => {
            if (dc !== dropdown) dc.style.display = 'none';
        });
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    });
});

// Load page content into main-content
document.querySelectorAll('[data-page]').forEach(link => {
    link.addEventListener('click', function (e) {
        e.preventDefault();

        //const page = this.getAttribute('data-page');
        const page = link.dataset.page;
        const jsFile = link.dataset.js;
        const initFuncName = link.dataset.init;

        if (!page) {
            console.warn('No page specified for this link');
            return;
        }

        fetch(page)
            .then(res => res.text())
            .then(html => {
                hideMenuItemGroup("timesheet");

                document.getElementById('main-content').innerHTML = html;

                if (jsFile) {
                    loadScript(jsFile).then(() => {
                        if (initFuncName) {
                            // Dynamically resolve and call the init function
                            const parts = initFuncName.split('.');
                            const methodName = parts.pop();
                            const obj = parts.reduce((o, key) => (o ? o[key] : undefined), window);

                            if (obj && typeof obj[methodName] === 'function') {
                                obj[methodName]();  // call method with correct context
                            } else {
                                console.warn(`Init function ${initFuncName} not found or not a function`);
                            }
                        }
                    }).catch(err => console.error('Failed to load script:', err));
                } else if (initFuncName) {
                    // If no JS file but init function specified (already loaded?)
                    const parts = initFuncName.split('.');
                    const methodName = parts.pop();
                    const obj = parts.reduce((o, key) => (o ? o[key] : undefined), window);

                    if (obj && typeof obj[methodName] === 'function') {
                        obj[methodName](new Date());  // call method with correct context
                    } else {
                        console.warn(`Init function ${initFuncName} not found or not a function`);
                    }
                }
            })
            .catch(err => console.error('Failed to load page:', err));
    });
});

// Handler for data-action (event delegation)
document.querySelectorAll('[data-action]').forEach(link => {
    link.addEventListener('click', function (e) {
        e.preventDefault();

        const target = e.target.closest("[data-action]");
        if (!target) return;

        const actionName = target.dataset.action;

        if (typeof window[actionName] === "function") {
            window[actionName]();
        } else {
            console.warn(`No function defined for: ${actionName}`);
        }
    });
});

// Close dropdowns when clicking outside
window.addEventListener('click', function () {
    document.querySelectorAll('.main-dropdown-content').forEach(dc => dc.style.display = 'none');
});

// Helper to dynamically load JS files
function loadScript(url) {
    return new Promise((resolve, reject) => {
        // Avoid loading the same script multiple times
        if (document.querySelector(`script[src="${url}"]`)) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => reject();
        document.head.appendChild(script);
    });
}

function hideMenuItemGroup(groupName) {
    document.querySelectorAll(`[data-menu-item-group="${groupName}"]`).forEach(el => {
        el.style.display = "none";
    });
}

function showMenuItemGroup(groupName) {
    document.querySelectorAll(`[data-menu-item-group="${groupName}"]`).forEach(el => {
        el.style.display = "";
    });
}