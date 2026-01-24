
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Star, Plus, Trash2, Loader2, Utensils } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { FoodItem } from "@/utils/nutrition-utils";

interface FavoritesSheetProps {
    onSelect: (food: FoodItem) => void;
}

export function FavoritesSheet({ onSelect }: FavoritesSheetProps) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const { data: favorites, isLoading } = useQuery({
        queryKey: ['favorite-foods', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data, error } = await supabase
                .from('favorite_foods')
                .select('*')
                .eq('user_id', user.id)
                .order('name');

            if (error) throw error;
            return data;
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
        },
        onError: () => toast.error("Failed to remove favorite")
    });

    return (
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
                        Favorite Foods
                    </SheetTitle>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto py-6 space-y-4">
                    {isLoading ? (
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
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:text-destructive absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteFavorite.mutate(fav.id);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-primary/5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
                                </div>
                            </GlassCard>
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
