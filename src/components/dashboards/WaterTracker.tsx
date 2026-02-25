import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { supabase } from '@/integrations/sb_client/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Droplets, Plus, Trash2 } from 'lucide-react';

interface WaterLog {
    id: string;
    amount_oz: number;
    logged_at: string;
}

export function WaterTracker() {
    const [customAmount, setCustomAmount] = useState('');
    const queryClient = useQueryClient();

    // Fetch user's water goal
    const { data: waterGoal = 64 } = useQuery({
        queryKey: ['water-goal'],
        queryFn: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return 64;

            const { data } = await supabase
                .from('daily_macro_goals')
                .select('water_goal_oz')
                .eq('user_id', session.user.id)
                .single();

            return data?.water_goal_oz || 64;
        }
    });

    // Fetch today's water logs
    const { data: waterLogs = [] } = useQuery<WaterLog[]>({
        queryKey: ['water-logs'],
        queryFn: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return [];

            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);
            const { data } = await supabase
                .from('water_logs')
                .select('id, amount_oz, logged_at')
                .eq('user_id', session.user.id)
                .gte('logged_at', startOfToday.toISOString())
                .lte('logged_at', endOfToday.toISOString())
                .order('logged_at', { ascending: false });

            return data || [];
        }
    });

    // Calculate today's total
    const todayTotal = waterLogs.reduce((sum, log) => sum + log.amount_oz, 0);

    // Add water mutation
    const addWaterMutation = useMutation({
        mutationFn: async (amount: number) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { error } = await supabase
                .from('water_logs')
                .insert({
                    user_id: session.user.id,
                    amount_oz: amount
                });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['water-logs'] });
            toast.success('Water logged!');
        },
        onError: () => {
            toast.error('Failed to log water');
        }
    });

    // Delete water log mutation
    const deleteWaterMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('water_logs')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['water-logs'] });
            toast.success('Log deleted');
        },
        onError: () => {
            toast.error('Failed to delete log');
        }
    });

    const handleQuickAdd = (amount: number) => {
        addWaterMutation.mutate(amount);
    };

    const handleCustomAdd = () => {
        const amount = parseInt(customAmount);
        if (isNaN(amount) || amount <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }
        addWaterMutation.mutate(amount);
        setCustomAmount('');
    };

    const formatTime = (timestamp: string) => {
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    return (
        <Card className="shadow-card bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Droplets className="h-5 w-5 text-blue-500" />
                    Water Intake
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Progress Ring */}
                <div className="flex justify-center">
                    <CircularProgress
                        value={todayTotal}
                        max={waterGoal}
                        label="oz today"
                        color="#3B82F6"
                        size={180}
                        strokeWidth={12}
                    />
                </div>

                {/* Quick Add Buttons */}
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Quick Add
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickAdd(8)}
                            disabled={addWaterMutation.isPending}
                        >
                            +8 oz
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickAdd(16)}
                            disabled={addWaterMutation.isPending}
                        >
                            +16 oz
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickAdd(32)}
                            disabled={addWaterMutation.isPending}
                        >
                            +32 oz
                        </Button>
                    </div>
                </div>

                {/* Custom Amount */}
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Custom Amount
                    </p>
                    <div className="flex gap-2">
                        <Input
                            type="number"
                            placeholder="oz"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            className="flex-1"
                            min="1"
                        />
                        <Button
                            onClick={handleCustomAdd}
                            disabled={addWaterMutation.isPending}
                            size="sm"
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                        </Button>
                    </div>
                </div>

                {/* Today's Logs */}
                {waterLogs.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Today's Logs
                        </p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {waterLogs.map((log) => (
                                <div
                                    key={log.id}
                                    className="flex items-center justify-between text-sm p-2 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                                >
                                    <span className="flex items-center gap-2">
                                        <Droplets className="h-3 w-3 text-blue-500" />
                                        {log.amount_oz} oz
                                        <span className="text-xs text-muted-foreground">
                                            · {formatTime(log.logged_at)}
                                        </span>
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => deleteWaterMutation.mutate(log.id)}
                                        disabled={deleteWaterMutation.isPending}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
