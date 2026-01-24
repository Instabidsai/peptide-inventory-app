// OpenFoodFacts API Service
// Fetches nutrition data from OpenFoodFacts database using product barcodes

const OPENFOODFACTS_API_BASE = 'https://world.openfoodfacts.org/api/v0';

export interface OpenFoodFactsProduct {
    status: number;
    status_verbose?: string;
    product?: {
        product_name?: string;
        brands?: string;
        quantity?: string;
        serving_size?: string;
        nutriments?: {
            'energy-kcal_100g'?: number;
            'energy-kcal_serving'?: number;
            proteins_100g?: number;
            proteins_serving?: number;
            carbohydrates_100g?: number;
            carbohydrates_serving?: number;
            fat_100g?: number;
            fat_serving?: number;
        };
        image_url?: string;
    };
}

export interface ParsedNutrition {
    name: string;
    brand?: string;
    quantity: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

/**
 * Fetch product data from OpenFoodFacts by barcode
 */
export async function fetchProductByBarcode(barcode: string): Promise<OpenFoodFactsProduct> {
    const response = await fetch(`${OPENFOODFACTS_API_BASE}/product/${barcode}.json`);

    if (!response.ok) {
        throw new Error(`Failed to fetch product: ${response.statusText}`);
    }

    const data: OpenFoodFactsProduct = await response.json();
    return data;
}

/**
 * Parse OpenFoodFacts product data into our app's nutrition format
 */
export function parseProductNutrition(data: OpenFoodFactsProduct): ParsedNutrition | null {
    if (data.status !== 1 || !data.product) {
        return null; // Product not found
    }

    const product = data.product;
    const nutriments = product.nutriments || {};

    // Try to get per-serving data first, fallback to per-100g
    const servingSize = product.serving_size || product.quantity || '100g';

    // Helper to extract numeric value from serving size (e.g., "60g" -> 60)
    const getServingGrams = (size: string): number => {
        const match = size.match(/(\d+\.?\d*)\s*g/i);
        return match ? parseFloat(match[1]) : 100;
    };

    const servingGrams = getServingGrams(servingSize);
    const ratio = servingGrams / 100; // Convert per-100g to per-serving

    // Calculate nutrition values (prefer per-serving if available, otherwise calculate from per-100g)
    const calories = nutriments['energy-kcal_serving']
        ?? (nutriments['energy-kcal_100g'] ? nutriments['energy-kcal_100g'] * ratio : 0);

    const protein = nutriments.proteins_serving
        ?? (nutriments.proteins_100g ? nutriments.proteins_100g * ratio : 0);

    const carbs = nutriments.carbohydrates_serving
        ?? (nutriments.carbohydrates_100g ? nutriments.carbohydrates_100g * ratio : 0);

    const fat = nutriments.fat_serving
        ?? (nutriments.fat_100g ? nutriments.fat_100g * ratio : 0);

    return {
        name: product.product_name || 'Unknown Product',
        brand: product.brands,
        quantity: servingSize,
        calories: Math.round(calories),
        protein: Math.round(protein * 10) / 10, // Round to 1 decimal
        carbs: Math.round(carbs * 10) / 10,
        fat: Math.round(fat * 10) / 10,
    };
}

/**
 * Combined function: fetch and parse product by barcode
 */
export async function getProductNutrition(barcode: string): Promise<ParsedNutrition | null> {
    try {
        const data = await fetchProductByBarcode(barcode);
        return parseProductNutrition(data);
    } catch (error) {
        console.error('Error fetching product nutrition:', error);
        throw error;
    }
}
