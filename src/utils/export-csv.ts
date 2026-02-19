/**
 * Generic CSV export utility.
 * Converts an array of objects to CSV and triggers a download.
 */
export function exportToCSV<T extends Record<string, unknown>>(
    data: T[],
    filename: string,
    columns?: { key: keyof T; label: string }[]
) {
    if (!data.length) return;

    const cols = columns || Object.keys(data[0]).map(k => ({ key: k as keyof T, label: String(k) }));

    const header = cols.map(c => `"${String(c.label)}"`).join(',');
    const rows = data.map(row =>
        cols.map(c => {
            const val = row[c.key];
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        }).join(',')
    );

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
