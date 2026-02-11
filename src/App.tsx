// App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoleBasedRedirect } from "@/components/RoleBasedRedirect";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Join from "./pages/Join";
import Onboarding from "./pages/Onboarding";
import Peptides from "./pages/Peptides";
import Lots from "./pages/Lots";
import Bottles from "./pages/Bottles";
import Orders from "./pages/Orders";
import OrderList from "./pages/sales/OrderList";
import NewOrder from "./pages/sales/NewOrder";
import OrderDetails from "./pages/sales/OrderDetails";

// Block 4: Admin Management
import Reps from "./pages/admin/Reps";
import Contacts from "./pages/Contacts"; // Moved here
import Protocols from "./pages/Protocols"; // Moved here
import ContactDetails from "./pages/ContactDetails"; // THE ONE WITH THE FIX
import Movements from "./pages/Movements"; // Moved here
import MovementWizard from "./pages/MovementWizard"; // Moved here
import Settings from "./pages/Settings"; // Moved here
import AdminFeedback from "./pages/AdminFeedback";
import AdminRequests from "./pages/admin/AdminRequests";
import AdminResources from "./pages/AdminResources";
import Commissions from "./pages/admin/Commissions";
import Finance from "./pages/admin/Finance";
import AdminSupplements from "./pages/admin/AdminSupplements";
import PartnerDetail from "./pages/admin/PartnerDetail";
import PartnerDashboard from "./pages/partner/PartnerDashboard";
import PartnerStore from "./pages/partner/PartnerStore";
import NotFound from "./pages/NotFound";

// Client Portal
import { ClientLayout } from "@/components/layout/ClientLayout";
import ClientDashboard from "./pages/client/ClientDashboard";
import ClientRegimen from "./pages/client/ClientRegimen";
import ClientMessages from "./pages/client/ClientMessages";
import ClientNotifications from "./pages/client/ClientNotifications";
import ClientResources from "./pages/client/ClientResources";
import ClientSettings from "./pages/client/ClientSettings";
import MacroTracker from "./pages/client/MacroTracker";
import BodyComposition from "./pages/client/BodyComposition";
import CommunityForum from "./pages/client/CommunityForum";
import ClientStore from "./pages/client/ClientStore";

console.log("App.tsx Module Loaded - Imports Valid (Block 4: Admin + Full)");
const queryClient = new QueryClient();

const App = () => (
    <QueryClientProvider client={queryClient}>
        <TooltipProvider>
            <Toaster />
            <Sonner />
            <HashRouter>
                <AuthProvider>
                    <Routes>
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/debug-auth" element={<Auth />} />
                        <Route path="/join" element={<Join />} />
                        <Route path="/onboarding" element={<Onboarding />} />
                        <Route element={
                            <ProtectedRoute>
                                <RoleBasedRedirect allowedRoles={['customer']}>
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

                            <Route path="/bottles" element={<Bottles />} />

                            {/* GROUP A (Active) */}
                            <Route path="/contacts" element={<Contacts />} />
                            <Route path="/protocols" element={<Protocols />} />
                            <Route path="/contacts/:id" element={<ContactDetails />} />

                            <Route path="/movements" element={<Movements />} />
                            <Route path="/movements/new" element={<MovementWizard />} />
                            <Route path="/settings" element={<Settings />} />

                        </Route>
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </AuthProvider>
            </HashRouter>
        </TooltipProvider>
    </QueryClientProvider>
);

export default App;
