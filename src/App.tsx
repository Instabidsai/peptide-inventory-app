// App.tsx
import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoleBasedRedirect } from "@/components/RoleBasedRedirect";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// Eagerly loaded — needed on first render
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Join from "./pages/Join";
import NotFound from "./pages/NotFound";

// Retry wrapper — reloads page on stale chunk errors after deploy
function lazyRetry(fn: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() => fn().catch(() => {
    window.location.reload();
    return new Promise(() => {}); // reload handles it
  }));
}

// Lazy loaded — only fetched when navigated to
const Onboarding = lazyRetry(() => import("./pages/Onboarding"));
const UpdatePassword = lazyRetry(() => import("./pages/auth/UpdatePassword"));
const Peptides = lazyRetry(() => import("./pages/Peptides"));
const Lots = lazyRetry(() => import("./pages/Lots"));
const Bottles = lazyRetry(() => import("./pages/Bottles"));
const Orders = lazyRetry(() => import("./pages/Orders"));
const OrderList = lazyRetry(() => import("./pages/sales/OrderList"));
const NewOrder = lazyRetry(() => import("./pages/sales/NewOrder"));
const OrderDetails = lazyRetry(() => import("./pages/sales/OrderDetails"));
const Reps = lazyRetry(() => import("./pages/admin/Reps"));
const Contacts = lazyRetry(() => import("./pages/Contacts"));
const Protocols = lazyRetry(() => import("./pages/Protocols"));
const ProtocolBuilder = lazyRetry(() => import("./pages/ProtocolBuilder"));
const FulfillmentCenter = lazyRetry(() => import("./pages/FulfillmentCenter"));
const ContactDetails = lazyRetry(() => import("./pages/ContactDetails"));
const Movements = lazyRetry(() => import("./pages/Movements"));
const MovementWizard = lazyRetry(() => import("./pages/MovementWizard"));
const Settings = lazyRetry(() => import("./pages/Settings"));
const AdminFeedback = lazyRetry(() => import("./pages/AdminFeedback"));
const AdminRequests = lazyRetry(() => import("./pages/admin/AdminRequests"));
const AdminResources = lazyRetry(() => import("./pages/AdminResources"));
const Commissions = lazyRetry(() => import("./pages/admin/Commissions"));
const Finance = lazyRetry(() => import("./pages/admin/Finance"));
const AdminSupplements = lazyRetry(() => import("./pages/admin/AdminSupplements"));
const PartnerDetail = lazyRetry(() => import("./pages/admin/PartnerDetail"));
const PartnerDashboard = lazyRetry(() => import("./pages/partner/PartnerDashboard"));
const PartnerStore = lazyRetry(() => import("./pages/partner/PartnerStore"));
const PartnerOrders = lazyRetry(() => import("./pages/partner/PartnerOrders"));

// Client Portal
import { ClientLayout } from "@/components/layout/ClientLayout";
const ClientDashboard = lazyRetry(() => import("./pages/client/ClientDashboard"));
const ClientRegimen = lazyRetry(() => import("./pages/client/ClientRegimen"));
const ClientMessages = lazyRetry(() => import("./pages/client/ClientMessages"));
const ClientNotifications = lazyRetry(() => import("./pages/client/ClientNotifications"));
const ClientResources = lazyRetry(() => import("./pages/client/ClientResources"));
const ClientSettings = lazyRetry(() => import("./pages/client/ClientSettings"));
const MacroTracker = lazyRetry(() => import("./pages/client/MacroTracker"));
const BodyComposition = lazyRetry(() => import("./pages/client/BodyComposition"));
const CommunityForum = lazyRetry(() => import("./pages/client/CommunityForum"));
const ClientStore = lazyRetry(() => import("./pages/client/ClientStore"));
const ClientOrders = lazyRetry(() => import("./pages/client/ClientOrders"));
const CheckoutSuccess = lazyRetry(() => import("./pages/checkout/CheckoutSuccess"));
const CheckoutCancel = lazyRetry(() => import("./pages/checkout/CheckoutCancel"));
const ClientMenu = lazyRetry(() => import("./pages/client/ClientMenu"));
const HealthTracking = lazyRetry(() => import("./pages/client/HealthTracking"));

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
        },
        mutations: {
            onError: (error: Error) => {
                console.error('[Mutation Error]', error.message);
            },
        },
    },
});

function PageLoader() {
    return (
        <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
}

const App = () => (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
        <TooltipProvider>
            <Toaster />
            <Sonner />
            <HashRouter>
                <AuthProvider>
                    <Suspense fallback={<PageLoader />}>
                        <Routes>
                            <Route path="/auth" element={<Auth />} />
                            <Route path="/join" element={<Join />} />
                            <Route path="/onboarding" element={<Onboarding />} />
                            <Route path="/update-password" element={<UpdatePassword />} />
                            <Route element={
                                <ProtectedRoute>
                                    <RoleBasedRedirect allowedRoles={['client', 'customer']}>
                                        <ClientLayout />
                                    </RoleBasedRedirect>
                                </ProtectedRoute>
                            }>
                                <Route path="/dashboard" element={<ClientDashboard />} />
                                <Route path="/my-regimen" element={<ClientRegimen />} />
                                <Route path="/messages" element={<ClientMessages />} />
                                <Route path="/notifications" element={<ClientNotifications />} />
                                <Route path="/resources" element={<ClientResources />} />
                                <Route path="/account" element={<ClientSettings />} />
                                <Route path="/macro-tracker" element={<MacroTracker />} />
                                <Route path="/body-composition" element={<BodyComposition />} />
                                <Route path="/community" element={<CommunityForum />} />
                                <Route path="/store" element={<ClientStore />} />
                                <Route path="/my-orders" element={<ClientOrders />} />
                                <Route path="/checkout/success" element={<CheckoutSuccess />} />
                                <Route path="/checkout/cancel" element={<CheckoutCancel />} />
                                <Route path="/menu" element={<ClientMenu />} />
                                <Route path="/health" element={<HealthTracking />} />
                            </Route>

                            <Route element={
                                <ProtectedRoute>
                                    <RoleBasedRedirect allowedRoles={['admin', 'staff', 'sales_rep', 'fulfillment']}>
                                        <AppLayout />
                                    </RoleBasedRedirect>
                                </ProtectedRoute>
                            }>
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/peptides" element={<Peptides />} />
                                <Route path="/lots" element={<RoleBasedRedirect><Lots /></RoleBasedRedirect>} />
                                <Route path="/orders" element={<Orders />} />

                                <Route path="/feedback" element={<RoleBasedRedirect><AdminFeedback /></RoleBasedRedirect>} />
                                <Route path="/requests" element={<RoleBasedRedirect><AdminRequests /></RoleBasedRedirect>} />
                                <Route path="/admin-resources" element={<RoleBasedRedirect><AdminResources /></RoleBasedRedirect>} />

                                <Route path="/sales" element={<OrderList />} />
                                <Route path="/sales/new" element={<NewOrder />} />
                                <Route path="/sales/:id" element={<OrderDetails />} />

                                <Route path="/admin/reps" element={<RoleBasedRedirect allowedRoles={['admin']}><Reps /></RoleBasedRedirect>} />
                                <Route path="/admin/partners/:id" element={<RoleBasedRedirect allowedRoles={['admin']}><PartnerDetail /></RoleBasedRedirect>} />
                                <Route path="/admin/commissions" element={<RoleBasedRedirect allowedRoles={['admin']}><Commissions /></RoleBasedRedirect>} />

                                <Route path="/admin/finance" element={<RoleBasedRedirect allowedRoles={['admin']}><Finance /></RoleBasedRedirect>} />
                                <Route path="/admin/supplements" element={<AdminSupplements />} />

                                <Route path="/partner" element={<PartnerDashboard />} />
                                <Route path="/partner/store" element={<PartnerStore />} />
                                <Route path="/partner/orders" element={<PartnerOrders />} />

                                <Route path="/bottles" element={<Bottles />} />

                                <Route path="/contacts" element={<Contacts />} />
                                <Route path="/protocols" element={<Protocols />} />
                                <Route path="/protocol-builder" element={<ProtocolBuilder />} />
                                <Route path="/fulfillment" element={<FulfillmentCenter />} />
                                <Route path="/contacts/:id" element={<ContactDetails />} />

                                <Route path="/movements" element={<Movements />} />
                                <Route path="/movements/new" element={<MovementWizard />} />
                                <Route path="/settings" element={<Settings />} />
                                <Route path="/checkout/success" element={<CheckoutSuccess />} />
                                <Route path="/checkout/cancel" element={<CheckoutCancel />} />

                            </Route>
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </Suspense>
                </AuthProvider>
            </HashRouter>
        </TooltipProvider>
    </QueryClientProvider>
    </ErrorBoundary>
);

export default App;
