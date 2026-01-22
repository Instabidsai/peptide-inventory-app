import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import {
    Users,
    ShoppingCart,
    Plus,
    ArrowRight,
    BookOpen,
    MessageSquare,
    Activity,
    Briefcase
} from 'lucide-react';
import { useContacts } from '@/hooks/use-contacts';
// import { useMyOrders } from '@/hooks/use-orders'; // We might need this later

export default function PartnerDashboard() {
    const { user, userRole } = useAuth();

    // Fetch "My Clients" - Filter by assigned_rep_id via RLS or client-side for now
    // Note: For now, we fetch all and filter client-side until RLS is strict
    const { data: allContacts } = useContacts();

    // Logic to filter my clients
    // If we are previewing as a specific rep, we might need that ID.
    // But usually this dashboard is for the logged-in user.
    // For 'Preview Mode' (Admin viewing as Partner), userRole?.id is the Rep's profile ID if we mock it correctly?
    // Actually, 'Preview Mode' passes a query param usually. 
    // Let's assume for this specific component, we are rendering it because we detected the 'sales_rep' role (or preview).

    const myClients = allContacts?.filter(c =>
        (c as any).assigned_rep_id === userRole?.id
        // OR if we are admin previewing, maybe we see all? 
        // For simplicity, let's just show count of 'Partner' type contacts or something similar if strict filtering isn't ready.
        // Actually, let's check if the contact has ME as the assigned rep.
    ) || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Partner Portal</h1>
                    <p className="text-muted-foreground">
                        Welcome, {userRole?.full_name || 'Partner'}. Manage your clients and orders.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button asChild>
                        <Link to="/sales/new">
                            <Plus className="mr-2 h-4 w-4" />
                            New Order
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link to="/contacts">
                            <Users className="mr-2 h-4 w-4" />
                            My Clients
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* My Clients */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">My Clients</CardTitle>
                        <Users className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{myClients.length}</div>
                        <p className="text-xs text-muted-foreground">Active assigned listings</p>
                    </CardContent>
                </Card>

                {/* Recent Orders (Placeholder for now) */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">-</div>
                        <p className="text-xs text-muted-foreground">Orders found</p>
                    </CardContent>
                </Card>

                {/* Commission (Placeholder) */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Commission Rate</CardTitle>
                        <Briefcase className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {((userRole?.commission_rate || 0) * 100).toFixed(0)}%
                        </div>
                        <p className="text-xs text-muted-foreground">Per completed sale</p>
                    </CardContent>
                </Card>
            </div>

            {/* Family / Resources Section */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/community'}>
                    <CardHeader>
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-full">
                                <MessageSquare className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <CardTitle className="text-base">Community Forum</CardTitle>
                                <CardDescription>Connect with the network</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                </Card>

                <Card className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/resources'}>
                    <CardHeader>
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-full">
                                <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                                <CardTitle className="text-base">Resources & Research</CardTitle>
                                <CardDescription>Access guides and papers</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                </Card>

                <Card className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/my-regimen'}>
                    <CardHeader>
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-pink-100 dark:bg-pink-900 rounded-full">
                                <Activity className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                            </div>
                            <div>
                                <CardTitle className="text-base">My Regimen</CardTitle>
                                <CardDescription>Track your personal protocol</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                </Card>
            </div>
        </div>
    );
}
