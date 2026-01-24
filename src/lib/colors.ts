// Industry-standard macro color coding
// Based on research from MyFitnessPal, Lose It, and modern fitness apps

export const MACRO_COLORS = {
    protein: '#2563EB',    // Blue - Industry standard for protein
    carbs: '#10B981',      // Green/Teal - Industry standard for carbohydrates  
    fat: '#F59E0B',        // Orange/Amber - Industry standard for fats
    calories: '#1F2937'    // Dark gray for total calories
} as const;

export const STATUS_COLORS = {
    onTrack: '#10B981',      // Green - goal met or on track
    overBudget: '#EF4444',   // Red - over budget
    warning: '#F59E0B',      // Orange - approaching limit
    success: '#059669'       // Darker green for achievements
} as const;

export const MACRO_COLORS_LIGHT = {
    protein: '#DBEAFE',      // Light blue background
    carbs: '#D1FAE5',        // Light green background
    fat: '#FEF3C7'           // Light orange background
} as const;
