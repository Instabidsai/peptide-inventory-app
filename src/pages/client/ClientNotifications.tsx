import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Loader2, Bell, Check, Info, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function ClientNotifications() {
    const { user } = useAuth();

    const { data: notifications, isLoading, refetch } = useQuery({
        queryKey: ['notifications', user?.id],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Error fetching notifications:", error);
                return [];
            }
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
            .eq('is_read', false); // Only update unread

        if (error) {
            toast.error("Failed to update notifications");
        } else {
            toast.success("All marked as read");
            refetch();
        }
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
                <div className="flex justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : notifications?.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                        <div className="p-4 rounded-full bg-secondary/50 mb-4">
                            <Bell className="h-8 w-8 opacity-50" />
                        </div>
                        <h3 className="text-lg font-medium mb-1">No notifications</h3>
                        <p className="text-sm">You're all caught up!</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {notifications?.map((notification) => (
                        <Card key={notification.id} className={`transition-colors ${!notification.is_read ? 'bg-secondary/30 border-blue-200' : ''}`}>
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
                                        <Badge variant="secondary" className="mt-2 text-[10px] h-5">New</Badge>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
