
import { useState } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus, TrendingDown, TrendingUp, History, Camera } from "lucide-react";
import {
    Line,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from "recharts";
import { calculateRollingAverage } from "@/utils/chart-utils";
import { GlassCard } from "@/components/ui/glass-card";

interface BodyLog {
    id: string;
    date: string;
    weight: number;
    body_fat_percentage: number | null;
    muscle_mass: number | null;
    visceral_fat: number | null;
    water_percentage: number | null;
    bmi: number | null;
    bmr: number | null;
    notes: string | null;
    photo_url: string | null;
}

export default function BodyComposition() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [isLogging, setIsLogging] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        weight: "",
        body_fat: "",
        muscle_mass: "",
        visceral_fat: "",
        water_pct: "",
        bmi: "",
        bmr: ""
    });
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Handle Image Selection
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedImage(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    // Fetch Logs
    const { data: logs, isLoading } = useQuery({
        queryKey: ['body-logs', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data, error } = await supabase
                .from('body_composition_logs')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: true });

            if (error) throw error;
            return data as BodyLog[];
        },
        enabled: !!user?.id
    });

    // Mutation to Add Log
    const addLog = useMutation({
        mutationFn: async () => {
            if (!user?.id) throw new Error("Not authenticated");

            let photoUrl = null;

            // Upload Image if selected
            if (selectedImage) {
                const fileExt = selectedImage.name.split('.').pop();
                const fileName = `${user.id}-${Date.now()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('body-photos')
                    .upload(fileName, selectedImage);

                if (uploadError) throw uploadError;

                const { data } = supabase.storage
                    .from('body-photos')
                    .getPublicUrl(fileName);

                photoUrl = data.publicUrl;
            }

            // Use local date to avoid UTC rollover issues (logging for "tomorrow" late at night)
            const today = new Date();
            const localDate = today.getFullYear() + '-' +
                String(today.getMonth() + 1).padStart(2, '0') + '-' +
                String(today.getDate()).padStart(2, '0');

            const { error } = await supabase.from('body_composition_logs').insert({
                user_id: user.id,
                date: localDate, // YYYY-MM-DD in local time
                weight: parseFloat(formData.weight) || null,
                body_fat_percentage: parseFloat(formData.body_fat) || null,
                muscle_mass: parseFloat(formData.muscle_mass) || null,
                visceral_fat: parseFloat(formData.visceral_fat) || null,
                water_percentage: parseFloat(formData.water_pct) || null,
                bmi: parseFloat(formData.bmi) || null,
                bmr: parseFloat(formData.bmr) || null,
                photo_url: photoUrl
            });

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Logged successfully!");
            queryClient.invalidateQueries({ queryKey: ['body-logs'] });
            setIsLogging(false);
            setFormData({ weight: "", body_fat: "", muscle_mass: "", visceral_fat: "", water_pct: "", bmi: "", bmr: "" });
            setSelectedImage(null);
            setImagePreview(null);
        },
        onError: (err) => {
            toast.error("Failed to log: " + err.message);
        }
    });

    if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

    const latestLog = logs && logs.length > 0 ? logs[logs.length - 1] : null;

    return (
        <div className="container mx-auto p-4 max-w-2xl space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-primary">Body Composition</h1>
                <Button onClick={() => setIsLogging(!isLogging)} variant={isLogging ? "secondary" : "default"}>
                    {isLogging ? "Cancel" : <><Plus className="mr-2 h-4 w-4" /> Log New</>}
                </Button>
            </div>

            {/* Log Form */}
            {isLogging && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Log Today's Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Photo Upload */}
                        <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted"
                            onClick={() => document.getElementById('photo-upload')?.click()}>
                            {imagePreview ? (
                                <img src={imagePreview} alt="Preview" className="h-40 object-cover rounded-md" />
                            ) : (
                                <div className="text-center text-muted-foreground">
                                    <Camera className="h-8 w-8 mx-auto mb-2" />
                                    <span>Add Progress Photo</span>
                                </div>
                            )}
                            <input
                                id="photo-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageSelect}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Weight (lbs)</Label>
                                <Input type="number" value={formData.weight} onChange={e => setFormData({ ...formData, weight: e.target.value })} placeholder="e.g. 185" />
                            </div>
                            <div className="space-y-2">
                                <Label>Body Fat %</Label>
                                <Input type="number" value={formData.body_fat} onChange={e => setFormData({ ...formData, body_fat: e.target.value })} placeholder="e.g. 18.5" />
                            </div>
                            <div className="space-y-2">
                                <Label>Muscle Mass (lbs)</Label>
                                <Input type="number" value={formData.muscle_mass} onChange={e => setFormData({ ...formData, muscle_mass: e.target.value })} placeholder="e.g. 140" />
                            </div>
                            <div className="space-y-2">
                                <Label>Visceral Fat</Label>
                                <Input type="number" value={formData.visceral_fat} onChange={e => setFormData({ ...formData, visceral_fat: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Water %</Label>
                                <Input type="number" value={formData.water_pct} onChange={e => setFormData({ ...formData, water_pct: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>BMI</Label>
                                <Input type="number" value={formData.bmi} onChange={e => setFormData({ ...formData, bmi: e.target.value })} />
                            </div>
                        </div>
                        <Button className="w-full" onClick={() => addLog.mutate()} disabled={addLog.isPending}>
                            {addLog.isPending ? <Loader2 className="animate-spin mr-2" /> : "Save Entry"}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Latest Stats Cards */}
            {latestLog && (
                <div className="grid grid-cols-3 gap-4">
                    <GlassCard>
                        <CardContent className="pt-6 text-center">
                            <div className="text-2xl font-bold">{latestLog.weight}</div>
                            <div className="text-xs text-muted-foreground uppercase">Weight</div>
                        </CardContent>
                    </GlassCard>
                    <GlassCard>
                        <CardContent className="pt-6 text-center">
                            <div className="text-2xl font-bold text-blue-600">{latestLog.body_fat_percentage != null ? `${latestLog.body_fat_percentage}%` : '—'}</div>
                            <div className="text-xs text-muted-foreground uppercase">Body Fat</div>
                        </CardContent>
                    </GlassCard>
                    <GlassCard>
                        <CardContent className="pt-6 text-center">
                            <div className="text-2xl font-bold text-green-600">{latestLog.muscle_mass ?? '—'}</div>
                            <div className="text-xs text-muted-foreground uppercase">Muscle</div>
                        </CardContent>
                    </GlassCard>
                </div>
            )}

            {/* Photo Gallery */}
            {logs && logs.filter(l => l.photo_url).length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Progress Photos</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {logs.filter(l => l.photo_url).slice().reverse().map((log) => (
                            <Card key={log.id} className="overflow-hidden">
                                <CardContent className="p-0 relative group">
                                    <img
                                        src={log.photo_url!}
                                        alt={`Progress on ${log.date}`}
                                        className="w-full h-48 object-cover transition-transform group-hover:scale-105"
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2 text-xs">
                                        <div className="font-bold">{format(new Date(log.date), 'MMM d, yyyy')}</div>
                                        <div>{log.weight} lbs {log.body_fat_percentage ? `• ${log.body_fat_percentage}%` : ''}</div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Charts */}
            {/* Charts */}
            {logs && logs.length > 1 && (
                <div className="space-y-6">
                    <GlassCard>
                        <CardHeader>
                            <CardTitle className="text-sm">Weight Trend</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={calculateRollingAverage(logs, 'weight')}>
                                    <defs>
                                        <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={str => format(new Date(str), 'MMM d')}
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        domain={['auto', 'auto']}
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        labelFormatter={label => format(new Date(label), 'MMM d, yyyy')}
                                        contentStyle={{ background: 'rgba(255, 255, 255, 0.8)', border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend />
                                    <Area type="monotone" dataKey="weight" stroke="#93c5fd" fillOpacity={1} fill="url(#colorWeight)" strokeWidth={2} activeDot={{ r: 5 }} />
                                    <Line name="7-Day Avg" type="monotone" dataKey="weight_avg" stroke="#2563eb" strokeWidth={3} dot={false} strokeDasharray="5 5" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </GlassCard>

                    <GlassCard>
                        <CardHeader>
                            <CardTitle className="text-sm">Body Fat % Trend</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={calculateRollingAverage(logs, 'body_fat_percentage')}>
                                    <defs>
                                        <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ea384c" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#ea384c" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={str => format(new Date(str), 'MMM d')}
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        domain={['auto', 'auto']}
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        labelFormatter={label => format(new Date(label), 'MMM d, yyyy')}
                                        contentStyle={{ background: 'rgba(255, 255, 255, 0.8)', border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend />
                                    <Area type="monotone" dataKey="body_fat_percentage" stroke="#fca5a5" fillOpacity={1} fill="url(#colorFat)" strokeWidth={2} activeDot={{ r: 5 }} />
                                    <Line name="7-Day Avg" type="monotone" dataKey="body_fat_percentage_avg" stroke="#ea384c" strokeWidth={3} dot={false} strokeDasharray="5 5" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </GlassCard>
                </div>
            )}

            {(!logs || logs.length === 0) && !isLogging && (
                <div className="text-center py-10 text-muted-foreground">
                    <History className="mx-auto h-12 w-12 opacity-20 mb-4" />
                    <p>No body composition logs yet.</p>
                    <Button variant="link" onClick={() => setIsLogging(true)}>Log your first entry</Button>
                </div>
            )}
        </div>
    );
}
