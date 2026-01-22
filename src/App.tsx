import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import UpdatePassword from "./pages/auth/UpdatePassword";
import DebugAuth from "./pages/DebugAuth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Peptides from "./pages/Peptides";
import Lots from "./pages/Lots";
import Bottles from "./pages/Bottles";
import Orders from "./pages/Orders";
import OrderList from "./pages/sales/OrderList";
import NewOrder from "./pages/sales/NewOrder";
import OrderDetails from "./pages/sales/OrderDetails";
import DebugInvite from "./pages/DebugInvite";
import Join from "./pages/Join";
import Reps from "./pages/admin/Reps";
import Contacts from "./pages/Contacts";
import Protocols from "./pages/Protocols";
import ContactDetails from "./pages/ContactDetails";
import Movements from "./pages/Movements";
import MovementWizard from "./pages/MovementWizard";
import Settings from "./pages/Settings";
import AdminFeedback from "./pages/AdminFeedback";
import AdminResources from "./pages/AdminResources";
import AdminSupplements from "./pages/admin/AdminSupplements";
import NotFound from "./pages/NotFound";

import { ClientLayout } from "@/components/layout/ClientLayout";
import ClientDashboard from "./pages/client/ClientDashboard";
import ClientRegimen from "./pages/client/ClientRegimen";
import ClientResources from "./pages/client/ClientResources";
import CommunityForum from "./pages/client/CommunityForum";
import { RoleBasedRedirect } from "@/components/RoleBasedRedirect";

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
            <Route path="/join" element={<Join />} />
            <Route path="/debug-invite" element={<DebugInvite />} />
            <Route path="/login" element={<Auth />} /> {/* Fail-safe for old links/redirects */}
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/debug-auth" element={<DebugAuth />} />
            <Route path="/onboarding" element={<Onboarding />} />



            {/* Admin Routes */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<RoleBasedRedirect><Dashboard /></RoleBasedRedirect>} />
              <Route path="/peptides" element={<Peptides />} />
              <Route path="/lots" element={<RoleBasedRedirect><Lots /></RoleBasedRedirect>} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/feedback" element={<RoleBasedRedirect><AdminFeedback /></RoleBasedRedirect>} />
              <Route path="/admin-resources" element={<RoleBasedRedirect><AdminResources /></RoleBasedRedirect>} />
              <Route path="/sales" element={<OrderList />} />
              <Route path="/sales/new" element={<NewOrder />} />
              <Route path="/sales/:id" element={<OrderDetails />} />
              <Route path="/admin/reps" element={<RoleBasedRedirect allowedRoles={['admin']}><Reps /></RoleBasedRedirect>} />
              <Route path="/admin/supplements" element={<AdminSupplements />} />
              <Route path="/bottles" element={<Bottles />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/movements" element={<Movements />} />
              <Route path="/movements/new" element={<MovementWizard />} />
              <Route path="/protocols" element={<Protocols />} />
              <Route path="/contacts/:id" element={<ContactDetails />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Client / Family Routes */}
            {/* Note: In a real app we'd strictly separate based on role in ProtectedRoute. 
                 For now, we just add these paths. Ideally, "/" should redirect based on role. */}
            <Route element={<ProtectedRoute><ClientLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<ClientDashboard />} />
              <Route path="/my-regimen" element={<ClientRegimen />} />
              <Route path="/resources" element={<ClientResources />} />
              <Route path="/community" element={<CommunityForum />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
