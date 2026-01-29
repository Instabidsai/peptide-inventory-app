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

    console.log("RoleBasedRedirect Check:", {
        loading,
        userRole: userRole?.role,
        userId: user?.id,
        allowedRoles
    });

    if (loading) {
        console.log("RoleBasedRedirect: Loading...");
        return <div className="h-screen flex items-center justify-center bg-gray-100 text-gray-800">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
                <p>Verifying Access...</p>
            </div>
        </div>;
    }

    // Safety check: specific to local dev issues where user might be null but app doesn't redirect
    if (!user) {
        console.warn("RoleBasedRedirect: No User found despite not loading. Redirecting to Auth.");
        return <Navigate to="/auth" replace />;
    }

    try {
        // 1. Explicitly block clients/customers from Admin areas
        const previewRole = searchParams.get('preview_role');

        // Allow Admins to preview as other roles
        let roleName = userRole?.role || '';
        if (roleName === 'admin' && previewRole) {
            console.log(`RoleBasedRedirect: Admin previewing as ${previewRole}`);
            roleName = previewRole;
        }

        if (roleName === 'client' || roleName === 'customer') {
            // ...unless the allowedRoles explicitly INCLUDES 'client' (unlikely for admin routes)
            if (allowedRoles && !allowedRoles.includes(roleName)) {
                console.log("RoleBasedRedirect: Client/Customer blocked from admin area. Redirecting to /dashboard");
                return <Navigate to="/dashboard" replace />;
            }
            // If allowedRoles is undefined, we assume it's an admin route default, so kick them out
            if (!allowedRoles) {
                console.log("RoleBasedRedirect: Client denied default access. Redirecting to /dashboard");
                return <Navigate to="/dashboard" replace />;
            }
        }

        // 2. Enforce strict allowedRoles if provided
        if (allowedRoles && roleName && !allowedRoles.includes(roleName)) {
            console.warn(`RoleBasedRedirect: Role '${roleName}' not in allowed list [${allowedRoles.join(', ')}]. Redirecting to /.`);
            return <Navigate to="/" replace />; // Redirect to their home (Admin Dashboard)
        }

        console.log("RoleBasedRedirect: Access Granted");
        return <>{children}</>;
    } catch (err) {
        console.error("RoleBasedRedirect CRASH:", err);
        return <div className="p-10 text-red-600 bg-red-50 border border-red-200 m-4 rounded">
            <h2 className="font-bold text-lg mb-2">Access Error</h2>
            <p>Something went wrong verifying your permissions.</p>
            <pre className="mt-4 text-xs bg-white p-2 border overflow-auto">{JSON.stringify(err, null, 2)}</pre>
        </div>;
    }
}
