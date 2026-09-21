export function openFile(accept = "") {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");

        input.type = "file";
        input.accept = accept;

        input.onchange = () => {
            const file = input.files?.[0];

            if (!file) {
                reject(new Error("No file selected."));
                return;
            }

            resolve(file);
        };

        input.click();
    });
}
