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
import { Loader2 } from "lucide-react";

// Eagerly loaded — needed on first render
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Join from "./pages/Join";
import NotFound from "./pages/NotFound";

// Lazy loaded — only fetched when navigated to
const Onboarding = lazy(() => import("./pages/Onboarding"));
const UpdatePassword = lazy(() => import("./pages/auth/UpdatePassword"));
const Peptides = lazy(() => import("./pages/Peptides"));
const Lots = lazy(() => import("./pages/Lots"));
const Bottles = lazy(() => import("./pages/Bottles"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderList = lazy(() => import("./pages/sales/OrderList"));
const NewOrder = lazy(() => import("./pages/sales/NewOrder"));
const OrderDetails = lazy(() => import("./pages/sales/OrderDetails"));
const Reps = lazy(() => import("./pages/admin/Reps"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Protocols = lazy(() => import("./pages/Protocols"));
const ContactDetails = lazy(() => import("./pages/ContactDetails"));
const Movements = lazy(() => import("./pages/Movements"));
const MovementWizard = lazy(() => import("./pages/MovementWizard"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminFeedback = lazy(() => import("./pages/AdminFeedback"));
const AdminRequests = lazy(() => import("./pages/admin/AdminRequests"));
const AdminResources = lazy(() => import("./pages/AdminResources"));
const Commissions = lazy(() => import("./pages/admin/Commissions"));
const Finance = lazy(() => import("./pages/admin/Finance"));
const AdminSupplements = lazy(() => import("./pages/admin/AdminSupplements"));
const PartnerDetail = lazy(() => import("./pages/admin/PartnerDetail"));
const PartnerDashboard = lazy(() => import("./pages/partner/PartnerDashboard"));
const PartnerStore = lazy(() => import("./pages/partner/PartnerStore"));
const PartnerOrders = lazy(() => import("./pages/partner/PartnerOrders"));

// Client Portal
import { ClientLayout } from "@/components/layout/ClientLayout";
const ClientDashboard = lazy(() => import("./pages/client/ClientDashboard"));
const ClientRegimen = lazy(() => import("./pages/client/ClientRegimen"));
const ClientMessages = lazy(() => import("./pages/client/ClientMessages"));
const ClientNotifications = lazy(() => import("./pages/client/ClientNotifications"));
const ClientResources = lazy(() => import("./pages/client/ClientResources"));
const ClientSettings = lazy(() => import("./pages/client/ClientSettings"));
const MacroTracker = lazy(() => import("./pages/client/MacroTracker"));
const BodyComposition = lazy(() => import("./pages/client/BodyComposition"));
const CommunityForum = lazy(() => import("./pages/client/CommunityForum"));
const ClientStore = lazy(() => import("./pages/client/ClientStore"));
const ClientOrders = lazy(() => import("./pages/client/ClientOrders"));
const CheckoutSuccess = lazy(() => import("./pages/checkout/CheckoutSuccess"));
const CheckoutCancel = lazy(() => import("./pages/checkout/CheckoutCancel"));

const queryClient = new QueryClient();

function PageLoader() {
    return (
        <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
}

const App = () => (
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
                            </Route>

                            <Route element={
                                <ProtectedRoute>
                                    <RoleBasedRedirect allowedRoles={['admin', 'staff', 'sales_rep']}>
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
);

export default App;
