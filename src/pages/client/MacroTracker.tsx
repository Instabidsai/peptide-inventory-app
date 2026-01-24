
import { useState } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Camera, Upload, Plus, Trash2, CheckCircle2, History } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { calculateMealTotals, FoodItem } from '@/utils/nutrition-utils';
import { GlassCard } from "@/components/ui/glass-card";
import confetti from "canvas-confetti";
import { TodaysLogsList } from '@/components/dashboards/TodaysLogsList';

interface AnalysisResult {
    foods: FoodItem[];
    total_calories: number;
    total_protein: number;
    total_carbs: number;
    total_fat: number;
}

export default function MacroTracker() {
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const queryClient = useQueryClient();
    const navigate = useNavigate(); // Ensuring navigate is safe to use if unrelated logic


    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result as string;
            setImage(base64String);
            analyzeImage(base64String);
        };
        reader.readAsDataURL(file);
    };

    const analyzeImage = async (base64Image: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('analyze-food', {
                body: { image: base64Image }
            });

            if (error) throw error;

            setResult(data);
            toast.success("Analysis complete!");
        } catch (error) {
            console.error("Analysis failed:", error);
            toast.error("Failed to analyze food. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const updateFoodItem = (index: number, field: keyof FoodItem, value: string | number) => {
        if (!result) return;
        const newFoods = [...result.foods];
        newFoods[index] = { ...newFoods[index], [field]: value };
        recalculateTotals(newFoods);
    };

    const removeFoodItem = (index: number) => {
        if (!result) return;
        const newFoods = result.foods.filter((_, i) => i !== index);
        recalculateTotals(newFoods);
    };

    const addFoodItem = () => {
        if (!result) return;
        const newFoods = [...result.foods, { name: "New Item", quantity: "1 serving", calories: 0, protein: 0, carbs: 0, fat: 0 }];
        recalculateTotals(newFoods);
    };

    const [showSettings, setShowSettings] = useState(false);
    const [goals, setGoals] = useState({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65
    });

    // Load initial goals
    useState(() => {
        const fetchGoals = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data, error } = await supabase
                .from('daily_macro_goals')
                .select('*')
                .eq('user_id', session.user.id)
                .maybeSingle();

            if (data) {
                setGoals({
                    calories: data.calories_target,
                    protein: data.protein_target,
                    carbs: data.carbs_target,
                    fat: data.fat_target
                });
            }
        };
        fetchGoals();
    });

    const saveGoals = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { error } = await supabase
            .from('daily_macro_goals')
            .upsert({
                user_id: session.user.id,
                calories_target: goals.calories,
                protein_target: goals.protein,
                carbs_target: goals.carbs,
                fat_target: goals.fat,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) {
            toast.error("Failed to save goals");
        } else {
            toast.success("Goals updated!");
            setShowSettings(false);
        }
    };

    const recalculateTotals = (foods: FoodItem[]) => {
        const totals = foods.reduce((acc, item) => ({
            calories: acc.calories + Number(item.calories || 0),
            protein: acc.protein + Number(item.protein || 0),
            carbs: acc.carbs + Number(item.carbs || 0),
            fat: acc.fat + Number(item.fat || 0),
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        setResult({
            foods,
            total_calories: totals.calories,
            total_protein: totals.protein,
            total_carbs: totals.carbs,
            total_fat: totals.fat
        });
    };

    // Fetch Recent Foods
    const { data: recentFoods, isLoading: recentFoodsLoading } = useQuery({
        queryKey: ['recent-foods'],
        queryFn: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return [];

            const { data } = await supabase
                .from('meal_logs')
                .select('foods')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (!data) return [];

            // Extract unique foods
            const uniqueFoods = new Map<string, FoodItem>();
            data.forEach(log => {
                const foods = log.foods as FoodItem[];
                if (Array.isArray(foods)) {
                    foods.forEach(f => {
                        if (!uniqueFoods.has(f.name)) {
                            uniqueFoods.set(f.name, f);
                        }
                    });
                }
            });

            return Array.from(uniqueFoods.values()).slice(0, 8); // Top 8 recent unique items
        }
    });

    const handleQuickAdd = (food: FoodItem) => {
        setResult({
            foods: [food],
            total_calories: Number(food.calories),
            total_protein: Number(food.protein),
            total_carbs: Number(food.carbs),
            total_fat: Number(food.fat)
        });
        toast.info(`Loaded ${food.name}. Make adjustments if needed.`);
    };

    const logMeal = async () => {
        if (!result) return;

        try {
            // Check for user session manually if useAuth isn't ready or just use supabase auth
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast.error("You must be logged in to save meals.");
                return;
            }

            const { error } = await supabase.from('meal_logs').insert({
                user_id: session.user.id,
                foods: result.foods,
                total_calories: result.total_calories,
                total_protein: result.total_protein,
                total_carbs: result.total_carbs,
                total_fat: result.total_fat
            });

            if (error) throw error;

            toast.success("Meal logged successfully!");

            // Celebration!
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });

            queryClient.invalidateQueries({ queryKey: ['todays-meal-logs'] });
            queryClient.invalidateQueries({ queryKey: ['daily-macros'] });

            setImage(null);
            setResult(null);
            // navigate('/dashboard'); // Optional
        } catch (error) {
            console.error("Error logging meal:", error);
            toast.error("Failed to log meal.");
        }
    };

    return (
        <div className="container mx-auto p-4 max-w-2xl relative">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-primary">Snap & Track Macros</h1>
                <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
                    {showSettings ? "Close" : "Goals"}
                </Button>
            </div>

            {showSettings && (
                <GlassCard className="mb-6 border-blue-200 bg-blue-50/50">
                    <CardHeader>
                        <CardTitle className="text-lg">Daily Goals</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Calories</Label>
                                <Input type="number" value={goals.calories} onChange={e => setGoals({ ...goals, calories: Number(e.target.value) })} />
                            </div>
                            <div>
                                <Label>Protein (g)</Label>
                                <Input type="number" value={goals.protein} onChange={e => setGoals({ ...goals, protein: Number(e.target.value) })} />
                            </div>
                            <div>
                                <Label>Carbs (g)</Label>
                                <Input type="number" value={goals.carbs} onChange={e => setGoals({ ...goals, carbs: Number(e.target.value) })} />
                            </div>
                            <div>
                                <Label>Fat (g)</Label>
                                <Input type="number" value={goals.fat} onChange={e => setGoals({ ...goals, fat: Number(e.target.value) })} />
                            </div>
                        </div>
                        <Button className="w-full mt-4" onClick={saveGoals}>Save Goals</Button>
                    </CardContent>
                </GlassCard>
            )}

            {/* Recent Foods Quick Add */}
            <div className="mb-6">
                <h3 className="text-sm font-medium mb-2 text-muted-foreground flex items-center">
                    <History className="h-4 w-4 mr-2" /> Recent Foods
                </h3>
                <div className="flex flex-wrap gap-2">
                    {recentFoodsLoading ? (
                        <div className="text-xs text-muted-foreground">Loading history...</div>
                    ) : recentFoods?.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No recent meals found. Log your first meal!</div>
                    ) : (
                        recentFoods?.map((food, idx) => (
                            <Button
                                key={idx}
                                variant="secondary"
                                size="sm"
                                className="text-xs h-8"
                                onClick={() => handleQuickAdd(food)}
                            >
                                <Plus className="h-3 w-3 mr-1" />
                                {food.name}
                            </Button>
                        ))
                    )}
                </div>
            </div>

            {!image && !result && (
                <GlassCard className="border-dashed border-2">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <div className="flex gap-4">
                            <Button variant="outline" className="h-24 w-24 flex flex-col gap-2 relative">
                                <Camera className="h-8 w-8" />
                                <span>Camera</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={handleImageUpload}
                                />
                            </Button>
                            <Button variant="outline" className="h-24 w-24 flex flex-col gap-2 relative">
                                <Upload className="h-8 w-8" />
                                <span>Upload</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={handleImageUpload}
                                />
                            </Button>
                        </div>
                        <p className="mt-4 text-muted-foreground text-sm">Take a photo or upload to analyze</p>
                    </CardContent>
                </GlassCard>
            )}

            {loading && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                        <p className="text-lg font-medium">Analyzing your meal...</p>
                        <p className="text-sm text-muted-foreground">This may take a few seconds</p>
                    </CardContent>
                </Card>
            )}

            {result && !loading && (
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Analysis Results</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-4 gap-4 text-center mb-6 p-4 bg-muted rounded-lg">
                                <div>
                                    <div className="text-2xl font-bold">{Math.round(result.total_calories)}</div>
                                    <div className="text-xs text-muted-foreground uppercase">Calories</div>
                                </div>
                                <div>
                                    <div className="text-xl font-bold text-blue-600">{Math.round(result.total_protein)}g</div>
                                    <div className="text-xs text-muted-foreground uppercase">Protein</div>
                                </div>
                                <div>
                                    <div className="text-xl font-bold text-green-600">{Math.round(result.total_carbs)}g</div>
                                    <div className="text-xs text-muted-foreground uppercase">Carbs</div>
                                </div>
                                <div>
                                    <div className="text-xl font-bold text-yellow-600">{Math.round(result.total_fat)}g</div>
                                    <div className="text-xs text-muted-foreground uppercase">Fat</div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {result.foods.map((food, idx) => (
                                    <div key={idx} className="flex flex-col gap-3 p-4 border rounded-lg bg-card/50">
                                        <div className="flex justify-between items-start">
                                            <Input
                                                value={food.name}
                                                onChange={(e) => updateFoodItem(idx, "name", e.target.value)}
                                                className="font-medium bg-transparent border-0 p-0 h-auto focus-visible:ring-0 text-lg w-full"
                                            />
                                            <Button variant="ghost" size="icon" onClick={() => removeFoodItem(idx)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label className="text-xs">Quantity</Label>
                                                <Input
                                                    value={food.quantity}
                                                    onChange={(e) => updateFoodItem(idx, "quantity", e.target.value)}
                                                    className="h-8"
                                                />
                                            </div>
                                            <div className="grid grid-cols-4 gap-2">
                                                <div>
                                                    <Label className="text-xs">Cal</Label>
                                                    <Input
                                                        type="number"
                                                        value={food.calories}
                                                        onChange={(e) => updateFoodItem(idx, "calories", parseFloat(e.target.value))}
                                                        className="h-8 px-1 text-center"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">P</Label>
                                                    <Input
                                                        type="number"
                                                        value={food.protein}
                                                        onChange={(e) => updateFoodItem(idx, "protein", parseFloat(e.target.value))}
                                                        className="h-8 px-1 text-center"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">C</Label>
                                                    <Input
                                                        type="number"
                                                        value={food.carbs}
                                                        onChange={(e) => updateFoodItem(idx, "carbs", parseFloat(e.target.value))}
                                                        className="h-8 px-1 text-center"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">F</Label>
                                                    <Input
                                                        type="number"
                                                        value={food.fat}
                                                        onChange={(e) => updateFoodItem(idx, "fat", parseFloat(e.target.value))}
                                                        className="h-8 px-1 text-center"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <Button variant="outline" className="w-full" onClick={addFoodItem}>
                                    <Plus className="h-4 w-4 mr-2" /> Add Food Item
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Button className="flex-1" onClick={logMeal}>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Log Meal
                    </Button>
                </div>
            )}

            {/* Today's Logs */}
            <div className="mt-8">
                <h3 className="text-lg font-semibold mb-3">Today's Logs</h3>
                {/* Reuse query or fetch here. For simplicity, we can let it be handled by a separate component or add the query.
                    Let's add the query in the main component for now for speed.
                 */}
                <TodaysLogsList />
            </div>
        </div>
    );
}
