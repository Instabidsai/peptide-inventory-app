
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { GlassCard } from "@/components/ui/glass-card";
import { format } from "date-fns";
import { Trash2, Loader2, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { startOfDay, endOfDay } from "date-fns";

export function TodaysLogsList() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const { data: logs, isLoading } = useQuery({
        queryKey: ['todays-meal-logs', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const start = startOfDay(new Date()).toISOString();
            const end = endOfDay(new Date()).toISOString();

            const { data } = await supabase
                .from('meal_logs')
                .select('*')
                .eq('user_id', user.id)
                .gte('created_at', start)
                .lte('created_at', end)
                .order('created_at', { ascending: false });

            return data || [];
        },
        enabled: !!user?.id
    });

    const deleteLog = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('meal_logs').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Log removed");
            queryClient.invalidateQueries({ queryKey: ['todays-meal-logs'] });
            // Also invalidate daily-macros so dashboard updates
            queryClient.invalidateQueries({ queryKey: ['daily-macros'] });
        },
        onError: () => toast.error("Failed to delete log")
    });

    if (isLoading) return <div className="text-center py-4 text-muted-foreground"><Loader2 className="animate-spin h-5 w-5 mx-auto" /></div>;

    if (!logs || logs.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                <Utensils className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No meals logged today yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {logs.map((log) => (
                <GlassCard key={log.id} className="p-4 flex items-center justify-between group">
                    <div>
                        <div className="font-medium flex items-center gap-2">
                            {/* @ts-ignore */}
                            {log.foods?.[0]?.name || "Meal"}
                            {/* @ts-ignore */}
                            {log.foods && log.foods.length > 1 && <span className="text-xs text-muted-foreground text-normal">+{log.foods.length - 1} more</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            <span className="text-blue-600 font-medium">{log.total_calories} cal</span> •
                            P: {log.total_protein}g • C: {log.total_carbs}g • F: {log.total_fat}g
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                            {format(new Date(log.created_at), 'h:mm a')}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteLog.mutate(log.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </GlassCard>
            ))}
        </div>
    );
}
