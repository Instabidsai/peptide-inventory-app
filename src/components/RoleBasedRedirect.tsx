import { Navigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { logger } from '@/lib/logger';

interface RoleBasedRedirectProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

export function RoleBasedRedirect({ children, allowedRoles }: RoleBasedRedirectProps) {
    const { userRole, loading, user, profile } = useAuth();
    const [searchParams] = useSearchParams();
    const location = useLocation();

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

    // No role yet (new user, profile still being set up) — let ProtectedRoute
    // handle the onboarding redirect; don't fight it with a redirect loop.
    if (!userRole?.role) {
        // If allowedRoles includes client/customer, allow through (new client scenario)
        if (allowedRoles?.some(r => ['client', 'customer'].includes(r))) {
            return <>{children}</>;
        }
        // Otherwise show loading briefly — profile data may still be arriving
        if (!profile?.org_id) {
            return <Navigate to="/onboarding" replace />;
        }
        return <>{children}</>;
    }

    try {
        const previewRole = searchParams.get('preview_role');

        // Allow staff/admin/sales_rep to preview as other roles
        let roleName = userRole.role;
        if (previewRole && ['admin', 'staff', 'sales_rep'].includes(roleName)) {
            roleName = previewRole;
        }

        // super_admin lands on their normal admin dashboard (not auto-redirected)
        // They can switch to /vendor via the sidebar mode switcher

        // Block clients/customers from admin areas — send to store or dashboard
        if (roleName === 'client' || roleName === 'customer') {
            if (!allowedRoles || !allowedRoles.includes(roleName)) {
                // Preferred/discount customers land on the store (where they see 20% off)
                const hasDiscount = profile?.price_multiplier != null && profile.price_multiplier < 1;
                return <Navigate to={hasDiscount ? '/store' : '/dashboard'} replace />;
            }
        }

        // Fulfillment users land on /fulfillment by default
        if (roleName === 'fulfillment' && location.pathname === '/') {
            return <Navigate to="/fulfillment" replace />;
        }

        // Enforce strict allowedRoles if provided
        // super_admin inherits admin access everywhere
        if (allowedRoles && !allowedRoles.includes(roleName)) {
            if (!(roleName === 'super_admin' && allowedRoles.includes('admin'))) {
                // Determine correct redirect based on role type
                const isClientRole = roleName === 'client' || roleName === 'customer';
                const hasDiscount = profile?.price_multiplier != null && profile.price_multiplier < 1;
                const target = isClientRole ? (hasDiscount ? '/store' : '/dashboard') : '/';
                // Prevent infinite redirect loop: if we'd redirect to the
                // same path we're already on, bail out to /auth instead
                if (location.pathname === target) {
                    return <Navigate to="/auth" replace />;
                }
                return <Navigate to={target} replace />;
            }
        }

        return <>{children}</>;
    } catch (err) {
        logger.error("RoleBasedRedirect error:", err);
        return <Navigate to="/" replace />;
    }
}
