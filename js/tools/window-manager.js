import { capitalizeText } from "./text-tools.js";

export function openModalWindow(pageName, options = {}) {
    const {
        overlay,
        title = capitalizeText(pageName),
        onEvent,
        onClose,
        onCancel,
        width = "75%",
        height = "75%",
        parameters
    } = options;

    overlay?.classList.remove("hidden");

    let completed = false;

    const winbox = new WinBox({
        title,
        width,
        height,
        x: "center",
        y: "center",
        index: 1001,
        class: ["settings-window"],
        url: `./pages/${pageName}.html${parameters ? `?${parameters}` : ""}`,
        onclose: () => {
            window.removeEventListener("message", messageHandler);
            overlay?.classList.add("hidden");

            if (!completed && onCancel) {
                onCancel();
            }

            if (onClose) {
                onClose();
            }
        }
    });

    function messageHandler(event) {
        const message = event.data;

        if (!message || !message.type) {
            return;
        }

        if (onEvent) {
            onEvent(message);
        }

        if (message.close === true) {
            completed = true;
            winbox.close();
        }
    }

    window.addEventListener("message", messageHandler);

    return winbox;
}

