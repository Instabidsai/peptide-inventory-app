import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface RoleBasedRedirectProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

export function RoleBasedRedirect({ children, allowedRoles }: RoleBasedRedirectProps) {
    const { userRole, loading } = useAuth();

    if (loading) {
        return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8" /></div>;
    }

    // 1. Explicitly block clients/customers from Admin areas
    const roleName = userRole?.role || '';
    if (roleName === 'client' || roleName === 'customer') {
        // ...unless the allowedRoles explicitly INCLUDES 'client' (unlikely for admin routes)
        if (allowedRoles && !allowedRoles.includes(userRole.role)) {
            return <Navigate to="/dashboard" replace />;
        }
        // If allowedRoles is undefined, we assume it's an admin route default, so kick them out
        if (!allowedRoles) {
            return <Navigate to="/dashboard" replace />;
        }
    }

    // 2. Enforce strict allowedRoles if provided
    if (allowedRoles && userRole?.role && !allowedRoles.includes(userRole.role)) {
        // If they are admin trying to see specific admin page, fine.
        // If they are 'staff' trying to see 'admin' only page:
        return <Navigate to="/" replace />; // Redirect to their home (Admin Dashboard)
    }

    return <>{children}</>;
}
