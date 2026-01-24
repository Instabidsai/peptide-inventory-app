
/**
 * Calculates a rolling average for a specific key in a dataset.
 * Assumes data is sorted by date ascending.
 * 
 * @param data Array of data objects
 * @param key The key to calculate average for (e.g., 'weight')
 * @param windowSize The number of periods to include in the average (default 7)
 * @returns New array with the original data plus a new field `${key}_avg`
 */
export function calculateRollingAverage<T extends Record<string, any>>(
    data: T[],
    key: keyof T,
    windowSize: number = 7
): (T & { [k: string]: number | null })[] {
    if (!data || data.length === 0) return [];

    return data.map((item, index) => {
        // Get the window of items ending at current index
        const start = Math.max(0, index - windowSize + 1);
        const window = data.slice(start, index + 1);

        // Filter out null/undefined values for the target key
        const validValues = window
            .map(w => Number(w[key]))
            .filter(v => !isNaN(v) && v !== 0 && v !== null);

        let average = null;
        if (validValues.length > 0) {
            const sum = validValues.reduce((a, b) => a + b, 0);
            average = Number((sum / validValues.length).toFixed(2));
        }

        // Return a new object so we don't mutate the original
        return {
            ...item,
            [`${String(key)}_avg`]: average
        };
    });
}
