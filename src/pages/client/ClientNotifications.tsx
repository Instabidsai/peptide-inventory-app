import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import {
    Bell,
    Check,
    Info,
    AlertTriangle,
    CheckCircle,
    XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function ClientNotifications() {
    const { user } = useAuth();

    const { data: notifications, isLoading, isError, refetch } = useQuery({
        queryKey: ['notifications', user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!user
    });

    const markAllRead = async () => {
        if (!user) return;
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false);

        if (error) {
            toast.error("Failed to update notifications");
        } else {
            toast.success("All marked as read");
            refetch();
        }
    };

    const markOneRead = async (id: string) => {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);
        if (!error) refetch();
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle className="h-5 w-5 text-emerald-500" />;
            case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
            case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
            default: return <Info className="h-5 w-5 text-blue-500" />;
        }
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
                    <p className="text-muted-foreground">Alerts and updates from your dashboard.</p>
                </div>
                {notifications && notifications.some(n => !n.is_read) && (
                    <Button variant="outline" size="sm" onClick={markAllRead}>
                        <Check className="mr-2 h-4 w-4" />
                        Mark all read
                    </Button>
                )}
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i}>
                            <CardContent className="p-4 flex gap-4 items-start">
                                <Skeleton className="h-5 w-5 rounded-full mt-1 shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-full" />
                                    <Skeleton className="h-3 w-1/2" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : isError ? (
                <QueryError message="Failed to load notifications." onRetry={refetch} />
            ) : notifications?.length === 0 ? (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                        <motion.div
                            className="p-4 rounded-full bg-secondary/50 mb-4"
                            animate={{ y: [0, -6, 0] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                        >
                            <Bell className="h-8 w-8 opacity-30" />
                        </motion.div>
                        <h3 className="text-lg font-semibold text-muted-foreground mb-1">No notifications</h3>
                        <p className="text-sm text-muted-foreground/70">You're all caught up!</p>
                    </CardContent>
                </Card>
                </motion.div>
            ) : (
                <motion.div
                    className="space-y-4"
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
                >
                    {notifications?.map((notification) => (
                        <motion.div key={notification.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
                        <Card
                            className={`transition-colors cursor-pointer hover:border-primary/20 ${!notification.is_read ? 'bg-secondary/30 border-primary/30' : ''}`}
                            onClick={() => !notification.is_read && markOneRead(notification.id)}
                        >
                            <CardContent className="p-4 flex gap-4 items-start">
                                <div className="mt-1">
                                    {getIcon(notification.type)}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className="flex justify-between items-start">
                                        <h4 className={`text-sm font-medium ${!notification.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                                            {notification.title}
                                        </h4>
                                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                                            {format(new Date(notification.created_at), 'MMM d, h:mm a')}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {notification.message}
                                    </p>
                                    {!notification.is_read && (
                                        <Badge variant="secondary" className="mt-2 text-[10px] h-5">Tap to dismiss</Badge>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                        </motion.div>
                    ))}
                </motion.div>
            )}
        </div>
    );
}
