import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface RoleBasedRedirectProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

export function RoleBasedRedirect({ children, allowedRoles }: RoleBasedRedirectProps) {
    const { userRole, loading, user } = useAuth();
    const [searchParams] = useSearchParams();

    if (loading) {
        return <div className="h-screen flex items-center justify-center bg-background text-foreground">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
                <p>Verifying Access...</p>
            </div>
        </div>;
    }

    if (!user) {
        return <Navigate to="/auth" replace />;
    }

    try {
        // 1. Explicitly block clients/customers from Admin areas
        const previewRole = searchParams.get('preview_role');

        // Allow staff/admin/sales_rep to preview as other roles (e.g. Family Portal)
        let roleName = userRole?.role || '';
        if (previewRole && ['admin', 'staff', 'sales_rep'].includes(roleName)) {
            roleName = previewRole;
        }

        if (roleName === 'client' || roleName === 'customer') {
            if (allowedRoles && !allowedRoles.includes(roleName)) {
                return <Navigate to="/dashboard" replace />;
            }
            if (!allowedRoles) {
                return <Navigate to="/dashboard" replace />;
            }
        }

        // 2. Fulfillment users land on /fulfillment by default
        if (roleName === 'fulfillment' && !allowedRoles) {
            const currentPath = window.location.hash.replace('#', '') || '/';
            if (currentPath === '/' || currentPath === '') {
                return <Navigate to="/fulfillment" replace />;
            }
        }

        // 3. Enforce strict allowedRoles if provided
        if (allowedRoles && roleName && !allowedRoles.includes(roleName)) {
            return <Navigate to="/" replace />;
        }

        return <>{children}</>;
    } catch (err) {
        console.error("RoleBasedRedirect error:", err);
        return <div className="p-10 text-red-600 bg-red-50 border border-red-200 m-4 rounded">
            <h2 className="font-bold text-lg mb-2">Access Error</h2>
            <p>Something went wrong verifying your permissions.</p>
            <pre className="mt-4 text-xs bg-card p-2 border overflow-auto">{JSON.stringify(err, null, 2)}</pre>
        </div>;
    }
}
