
import { describe, it, expect } from 'vitest';
import { calculateMealTotals, aggregateDailyLogs, processWeeklyChartData } from './nutrition-utils';

describe('nutrition-utils', () => {
    describe('calculateMealTotals', () => {
        it('should correctly sum up macros from multiple food items', () => {
            const foods = [
                { name: 'Apple', quantity: '1', calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
                { name: 'Egg', quantity: '1', calories: 70, protein: 6, carbs: 0, fat: 5 }
            ];

            const result = calculateMealTotals(foods);
            expect(result.calories).toBe(165);
            expect(result.protein).toBe(6.5);
            expect(result.carbs).toBe(25);
            expect(result.fat).toBe(5.3);
        });

        it('should handle empty list', () => {
            const result = calculateMealTotals([]);
            expect(result.calories).toBe(0);
        });
    });

    describe('aggregateDailyLogs', () => {
        it('should sum up multiple logs', () => {
            const logs = [
                { total_calories: 500, total_protein: 30, total_carbs: 40, total_fat: 20 },
                { total_calories: 200, total_protein: 10, total_carbs: 20, total_fat: 5 }
            ];
            const result = aggregateDailyLogs(logs);
            expect(result.calories).toBe(700);
            expect(result.protein).toBe(40);
        });
    });

    describe('processWeeklyChartData', () => {
        it('should generate 7 days of data even with no logs', () => {
            const data = processWeeklyChartData([]);
            expect(data).toHaveLength(7);
            expect(data[6].calories).toBe(0); // Today
        });

        it('should map logs to the correct day', () => {
            const today = new Date();
            const logs = [
                { created_at: today.toISOString(), total_calories: 500, total_protein: 20 }
            ];
            const data = processWeeklyChartData(logs, today);
            expect(data[6].calories).toBe(500); // Last item is today
        });
    });
});
