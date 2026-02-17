import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, Plus, Trash2, Loader2, Utensils, BookmarkPlus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { FoodItem } from "@/utils/nutrition-utils";

interface FavoritesSheetProps {
    onSelect: (food: FoodItem) => void;
}

interface Template {
    id: string;
    name: string;
    template_name: string | null;
    meal_type: string | null;
    quantity: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

export function FavoritesSheet({ onSelect }: FavoritesSheetProps) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [saveAsTemplateDialogOpen, setSaveAsTemplateDialogOpen] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [templateMealType, setTemplateMealType] = useState<string>('breakfast');
    const [selectedFoodToTemplate, setSelectedFoodToTemplate] = useState<FoodItem | null>(null);

    // Fetch favorites (is_template = false or null)
    const { data: favorites, isLoading: favoritesLoading } = useQuery({
        queryKey: ['favorite-foods', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data, error } = await supabase
                .from('favorite_foods')
                .select('*')
                .eq('user_id', user.id)
                .or('is_template.is.null,is_template.eq.false')
                .order('name');

            if (error) throw error;
            return data;
        },
        enabled: !!user?.id
    });

    // Fetch templates (is_template = true)
    const { data: templates, isLoading: templatesLoading } = useQuery<Template[]>({
        queryKey: ['meal-templates', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data, error } = await supabase
                .from('favorite_foods')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_template', true)
                .order('meal_type', { ascending: true })
                .order('template_name', { ascending: true });

            if (error) throw error;
            return data as Template[];
        },
        enabled: !!user?.id
    });

    const deleteFavorite = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('favorite_foods').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Removed from favorites");
            queryClient.invalidateQueries({ queryKey: ['favorite-foods'] });
            queryClient.invalidateQueries({ queryKey: ['meal-templates'] });
        },
        onError: () => toast.error("Failed to remove favorite")
    });

    const saveAsTemplate = useMutation({
        mutationFn: async () => {
            if (!user?.id || !selectedFoodToTemplate) throw new Error('Missing data');

            const { error } = await supabase.from('favorite_foods').insert({
                user_id: user.id,
                name: selectedFoodToTemplate.name,
                quantity: selectedFoodToTemplate.quantity,
                calories: selectedFoodToTemplate.calories,
                protein: selectedFoodToTemplate.protein,
                carbs: selectedFoodToTemplate.carbs,
                fat: selectedFoodToTemplate.fat,
                is_template: true,
                template_name: templateName,
                meal_type: templateMealType
            });

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Template saved!");
            queryClient.invalidateQueries({ queryKey: ['meal-templates'] });
            setSaveAsTemplateDialogOpen(false);
            setTemplateName('');
            setSelectedFoodToTemplate(null);
        },
        onError: () => toast.error("Failed to save template")
    });

    const openTemplateDialog = (food: FoodItem) => {
        setSelectedFoodToTemplate(food);
        setTemplateName(food.name); // Pre-fill with food name
        setSaveAsTemplateDialogOpen(true);
    };

    // Group templates by meal type
    const groupedTemplates = useMemo(() => {
        if (!templates) return {};
        return templates.reduce((acc, template) => {
            const type = template.meal_type || 'other';
            if (!acc[type]) acc[type] = [];
            acc[type].push(template);
            return acc;
        }, {} as Record<string, Template[]>);
    }, [templates]);

    return (
        <>
            <Sheet>
                <SheetTrigger asChild>
                    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-50">
                        <Button
                            size="sm"
                            variant="secondary"
                            className="h-24 w-8 rounded-l-xl rounded-r-none shadow-lg border-l border-y bg-background/80 backdrop-blur-md flex flex-col gap-2 p-1 hover:w-10 transition-all group"
                        >
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            <span className="text-[10px] font-bold [writing-mode:vertical-lr] text-muted-foreground group-hover:text-foreground">FAVES</span>
                        </Button>
                    </div>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px] flex flex-col h-full bg-background/95 backdrop-blur-lg">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                            Quick Add
                        </SheetTitle>
                    </SheetHeader>

                    <Tabs defaultValue="favorites" className="flex-1 flex flex-col">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="favorites">Favorites</TabsTrigger>
                            <TabsTrigger value="templates">Templates</TabsTrigger>
                        </TabsList>

                        {/* Favorites Tab */}
                        <TabsContent value="favorites" className="flex-1 overflow-y-auto space-y-4">
                            {favoritesLoading ? (
                                <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
                            ) : favorites?.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                                    <Utensils className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                    <p>No favorites yet.</p>
                                    <p className="text-xs mt-1">Star items in your logs or recent foods to add them here!</p>
                                </div>
                            ) : (
                                favorites?.map((fav) => (
                                    <GlassCard key={fav.id} className="p-4 group relative overflow-hidden transition-all hover:bg-muted/40 cursor-pointer border-white/5" onClick={() => onSelect({
                                        name: fav.name,
                                        quantity: fav.quantity || '1 serving',
                                        calories: fav.calories,
                                        protein: fav.protein,
                                        carbs: fav.carbs,
                                        fat: fav.fat
                                    })}>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-semibold text-lg">{fav.name}</div>
                                                <div className="text-sm text-muted-foreground">{fav.quantity}</div>
                                                <div className="mt-2 text-xs font-medium flex gap-3">
                                                    <span className="text-blue-600">{fav.calories} cal</span>
                                                    <span className="opacity-60">P: {fav.protein}g</span>
                                                    <span className="opacity-60">C: {fav.carbs}g</span>
                                                    <span className="opacity-60">F: {fav.fat}g</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Add to template"
                                                    className="text-muted-foreground hover:text-primary absolute top-2 right-10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openTemplateDialog(fav);
                                                    }}
                                                >
                                                    <BookmarkPlus className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Delete favorite"
                                                    className="text-muted-foreground hover:text-destructive absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteFavorite.mutate(fav.id);
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-primary/5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
                                        </div>
                                    </GlassCard>
                                ))
                            )}
                        </TabsContent>

                        {/* Templates Tab */}
                        <TabsContent value="templates" className="flex-1 overflow-y-auto space-y-6">
                            {templatesLoading ? (
                                <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
                            ) : templates?.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                                    <BookmarkPlus className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                    <p>No templates yet.</p>
                                    <p className="text-xs mt-1">Save frequently eaten meals as templates for quick logging!</p>
                                </div>
                            ) : (
                                Object.entries(groupedTemplates || {}).map(([mealType, items]) => (
                                    <div key={mealType}>
                                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                            {mealType}
                                        </h3>
                                        <div className="space-y-2">
                                            {items.map((template) => (
                                                <GlassCard key={template.id} className="p-3 group relative overflow-hidden transition-all hover:bg-muted/40 cursor-pointer border-white/5" onClick={() => onSelect({
                                                    name: template.name,
                                                    quantity: template.quantity || '1 serving',
                                                    calories: template.calories,
                                                    protein: template.protein,
                                                    carbs: template.carbs,
                                                    fat: template.fat
                                                })}>
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="font-semibold">{template.template_name || template.name}</div>
                                                            <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                                                                <span className="text-blue-600">{template.calories} cal</span>
                                                                <span>P: {template.protein}g</span>
                                                                <span>C: {template.carbs}g</span>
                                                                <span>F: {template.fat}g</span>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label="Delete template"
                                                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteFavorite.mutate(template.id);
                                                            }}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </GlassCard>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </TabsContent>
                    </Tabs>
                </SheetContent>
            </Sheet>

            {/* Save as Template Dialog */}
            <Dialog open={saveAsTemplateDialogOpen} onOpenChange={setSaveAsTemplateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save as Meal Template</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="template-name">Template Name</Label>
                            <Input
                                id="template-name"
                                placeholder="e.g., My Protein Shake"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="meal-type">Meal Type</Label>
                            <Select value={templateMealType} onValueChange={setTemplateMealType}>
                                <SelectTrigger id="meal-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="breakfast">Breakfast</SelectItem>
                                    <SelectItem value="lunch">Lunch</SelectItem>
                                    <SelectItem value="dinner">Dinner</SelectItem>
                                    <SelectItem value="snack">Snack</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSaveAsTemplateDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => saveAsTemplate.mutate()} disabled={!templateName.trim() || saveAsTemplate.isPending}>
                            {saveAsTemplate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Template
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
