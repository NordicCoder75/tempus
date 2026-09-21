export function rowHasContent(data) {
    return Object.entries(data).some(([key, value]) => {
        if (key.toLowerCase().includes("total")) {
            return false;
        }

        return value !== "" && value !== null && value !== undefined;
    });
}

export function ensureTrailingEmptyRow(rows, createEmptyRow) {
    if (rows.length === 0) {
        return [createEmptyRow()];
    }

    if (rowHasContent(rows[rows.length - 1])) {
        return [...rows, createEmptyRow()];
    }

    return rows;
}

export function formatNumberOrBlank(value) {
    const rawValue = value && typeof value.getValue === "function" ? value.getValue() : value;

    if (rawValue === "" || rawValue == null) {
        return "";
    }

    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue) || numericValue === 0) {
        return "";
    }

    return numericValue.toFixed(2);
}

export function deleteRowButtonFormatter() {
    return "<button class='delete-btn' type='button' aria-label='Delete row'>&times;</button>";
}

export async function saveEditedRowAndAppendEmptyRow({
    row,
    data,
    table,
    createEmptyRow,
    saveRowFn,
    hasContentFn = rowHasContent
}) {
    if (!hasContentFn(data)) {
        return;
    }

    const id = await saveRowFn(data);

    if (!data.id) {
        row.update({ id });
    }

    const rows = table.getRows();

    if (row === rows[rows.length - 1] && hasContentFn(data)) {
        table.addRow(createEmptyRow());
    }
}
