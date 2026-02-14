
import { startOfDay, endOfDay, subDays, format } from 'date-fns';

export interface FoodItem {
    name: string;
    quantity: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

export interface MacroTotals {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

export const calculateMealTotals = (foods: FoodItem[]): MacroTotals => {
    if (!foods || foods.length === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    return foods.reduce((acc, item) => ({
        calories: acc.calories + Number(item.calories || 0),
        protein: acc.protein + Number(item.protein || 0),
        carbs: acc.carbs + Number(item.carbs || 0),
        fat: acc.fat + Number(item.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
};

export const aggregateDailyLogs = (logs: any[]): MacroTotals => {
    if (!logs || logs.length === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    return logs.reduce((acc, log) => ({
        calories: acc.calories + Number(log.total_calories || 0),
        protein: acc.protein + Number(log.total_protein || 0),
        carbs: acc.carbs + Number(log.total_carbs || 0),
        fat: acc.fat + Number(log.total_fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
};

export interface DailyChartData {
    name: string;
    calories: number;
    protein: number;
    date: string;
}

export const processWeeklyChartData = (logs: any[], referenceDate: Date = new Date()): DailyChartData[] => {
    if (!logs || logs.length === 0) return [];
    const dailyMap = new Map();

    // Initialize last 7 days with 0
    for (let i = 6; i >= 0; i--) {
        const d = subDays(referenceDate, i);
        const key = format(d, 'yyyy-MM-dd');
        dailyMap.set(key, {
            name: format(d, 'EEE'),
            calories: 0,
            protein: 0,
            date: key
        });
    }

    logs?.forEach(log => {
        const d = new Date(log.created_at);
        const key = format(d, 'yyyy-MM-dd');
        if (dailyMap.has(key)) {
            const curr = dailyMap.get(key);
            curr.calories += Number(log.total_calories || 0);
            curr.protein += Number(log.total_protein || 0);
        }
    });

    return Array.from(dailyMap.values());
};
