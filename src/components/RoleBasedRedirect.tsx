import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export function RoleBasedRedirect({ children }: { children: React.ReactNode }) {
    const { userRole, loading } = useAuth();

    if (loading) {
        return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8" /></div>;
    }

    // If client, redirect to client dashboard
    // Note: We check if role is strictly 'client'. 
    // If userRole is null but user is logged in (handled by ProtectedRoute), it might be an edge case (no role yet). 
    // Assuming 'client' is the only non-admin role we care about redirecting AWAY from admin dashboard.
    if (userRole?.role === 'client') {
        return <Navigate to="/dashboard" replace />;
    }

    // Otherwise (admin, staff, viewer), allow access to Admin Dashboard
    return <>{children}</>;
}
