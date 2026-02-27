// App.tsx
import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoleBasedRedirect } from "@/components/RoleBasedRedirect";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SubdomainTenantProvider } from "@/hooks/use-subdomain-tenant";
import { BugReportButton } from "@/components/BugReportButton";
import { Loader2 } from "lucide-react";
import { toast as sonnerToast } from "sonner";

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
const Automations = lazyRetry(() => import("./pages/admin/Automations"));
const PartnerDashboard = lazyRetry(() => import("./pages/partner/PartnerDashboard"));
const PartnerStore = lazyRetry(() => import("./pages/partner/PartnerStore"));
const PartnerOrders = lazyRetry(() => import("./pages/partner/PartnerOrders"));
const AIAssistant = lazyRetry(() => import("./pages/AIAssistant"));
const FeatureManagement = lazyRetry(() => import("./pages/admin/FeatureManagement"));
const Integrations = lazyRetry(() => import("./pages/Integrations"));
const SystemHealth = lazyRetry(() => import("./pages/admin/SystemHealth"));

// Vendor (super-admin)
const VendorLayout = lazyRetry(() => import("./pages/vendor/VendorLayout"));
const VendorDashboard = lazyRetry(() => import("./pages/vendor/VendorDashboard"));
const VendorTenants = lazyRetry(() => import("./pages/vendor/VendorTenants"));
const TenantDetail = lazyRetry(() => import("./pages/vendor/TenantDetail"));
const VendorAnalytics = lazyRetry(() => import("./pages/vendor/VendorAnalytics"));
const VendorBilling = lazyRetry(() => import("./pages/vendor/VendorBilling"));
const VendorHealth = lazyRetry(() => import("./pages/vendor/VendorHealth"));
const VendorSupport = lazyRetry(() => import("./pages/vendor/VendorSupport"));
const VendorOnboarding = lazyRetry(() => import("./pages/vendor/VendorOnboarding"));
const VendorMessages = lazyRetry(() => import("./pages/vendor/VendorMessages"));
const VendorAudit = lazyRetry(() => import("./pages/vendor/VendorAudit"));
const VendorSettings = lazyRetry(() => import("./pages/vendor/VendorSettings"));
const VendorSupplyOrders = lazyRetry(() => import("./pages/vendor/VendorSupplyOrders"));
const VendorIntegrations = lazyRetry(() => import("./pages/vendor/VendorIntegrations"));

// Custom engine
const Customizations = lazyRetry(() => import("./pages/Customizations"));
const CustomEntityPage = lazyRetry(() => import("./components/custom/CustomEntityPage"));
const CustomReportView = lazyRetry(() => import("./components/custom/CustomReportView"));

// Merchant onboarding wizard (legacy — replaced by AI Setup Assistant)

// AI Setup Assistant (post-onboarding)
const SetupAssistant = lazyRetry(() => import("./pages/SetupAssistant"));

// Public status page (no auth)
const StatusPage = lazyRetry(() => import("./pages/StatusPage"));

// Public marketing
const CrmLanding = lazyRetry(() => import("./pages/CrmLanding"));
const GetStarted = lazyRetry(() => import("./pages/GetStarted"));
const PrivacyPolicy = lazyRetry(() => import("./pages/legal/PrivacyPolicy"));
const TermsOfService = lazyRetry(() => import("./pages/legal/TermsOfService"));

// Public payment links (no auth required)
const PayOrder = lazyRetry(() => import("./pages/pay/PayOrder"));
const PaySuccess = lazyRetry(() => import("./pages/pay/PaySuccess"));

// Client Portal
import { ClientLayout } from "@/components/layout/ClientLayout";
import { logger } from '@/lib/logger';
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
            staleTime: 60_000,        // 1 min default (was 30s — too aggressive for scale)
            gcTime: 5 * 60_000,       // keep unused cache for 5 min
            retry: 1,
            refetchOnWindowFocus: false,
        },
        mutations: {
            onError: (error: Error) => {
                logger.error('[Mutation Error]', error.message);
                sonnerToast.error(error.message || 'Something went wrong');
            },
        },
    },
});

function PageLoader() {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="relative">
                <div className="h-10 w-10 rounded-full border-2 border-primary/20" />
                <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-transparent border-t-primary animate-spin" />
            </div>
            <span className="text-xs text-muted-foreground/60 font-medium tracking-wide">Loading...</span>
        </div>
    );
}

const App = () => (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
        <TooltipProvider>
            <Toaster />
            <Sonner />
            <SubdomainTenantProvider>
            <HashRouter>
                <ImpersonationProvider>
                <AuthProvider>
                    <BugReportButton />
                    <Suspense fallback={<PageLoader />}>
                        <Routes>
                            <Route path="/crm" element={<CrmLanding />} />
                            <Route path="/get-started" element={<GetStarted />} />
                            <Route path="/privacy" element={<PrivacyPolicy />} />
                            <Route path="/terms" element={<TermsOfService />} />
                            <Route path="/status" element={<StatusPage />} />
                            <Route path="/pay/:orderId" element={<PayOrder />} />
                            <Route path="/pay/:orderId/success" element={<PaySuccess />} />
                            <Route path="/auth" element={<Auth />} />
                            <Route path="/join" element={<Join />} />
                            <Route path="/onboarding" element={<Onboarding />} />
                            <Route path="/merchant-onboarding" element={<Navigate to="/onboarding" replace />} />
                            <Route path="/update-password" element={<UpdatePassword />} />
                            <Route element={
                                <ProtectedRoute>
                                    <RoleBasedRedirect allowedRoles={['client', 'customer']}>
                                        <ErrorBoundary>
                                            <ClientLayout />
                                        </ErrorBoundary>
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
                                    <RoleBasedRedirect allowedRoles={['admin', 'staff', 'sales_rep', 'fulfillment', 'super_admin', 'viewer']}>
                                        <ErrorBoundary>
                                            <AppLayout />
                                        </ErrorBoundary>
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
                                <Route path="/admin/automations" element={<RoleBasedRedirect allowedRoles={['admin']}><Automations /></RoleBasedRedirect>} />
                                <Route path="/admin/supplements" element={<AdminSupplements />} />
                                <Route path="/admin/features" element={<RoleBasedRedirect allowedRoles={['admin']}><FeatureManagement /></RoleBasedRedirect>} />
                                <Route path="/admin/health" element={<Navigate to="/vendor/system-health" replace />} />

                                <Route path="/partner" element={<PartnerDashboard />} />
                                <Route path="/partner/store" element={<PartnerStore />} />
                                <Route path="/partner/orders" element={<PartnerOrders />} />

                                <Route path="/vendor" element={<RoleBasedRedirect allowedRoles={['super_admin']}><VendorLayout /></RoleBasedRedirect>}>
                                    <Route index element={<VendorDashboard />} />
                                    <Route path="tenants" element={<VendorTenants />} />
                                    <Route path="tenant/:orgId" element={<TenantDetail />} />
                                    <Route path="supply-orders" element={<VendorSupplyOrders />} />
                                    <Route path="analytics" element={<VendorAnalytics />} />
                                    <Route path="billing" element={<VendorBilling />} />
                                    <Route path="health" element={<VendorHealth />} />
                                    <Route path="system-health" element={<SystemHealth />} />
                                    <Route path="support" element={<VendorSupport />} />
                                    <Route path="onboarding" element={<VendorOnboarding />} />
                                    <Route path="messages" element={<VendorMessages />} />
                                    <Route path="audit" element={<VendorAudit />} />
                                    <Route path="settings" element={<VendorSettings />} />
                                    <Route path="integrations" element={<VendorIntegrations />} />
                                </Route>

                                <Route path="/bottles" element={<Bottles />} />

                                <Route path="/contacts" element={<Contacts />} />
                                <Route path="/protocols" element={<Protocols />} />
                                <Route path="/protocol-builder" element={<ProtocolBuilder />} />
                                <Route path="/fulfillment" element={<FulfillmentCenter />} />
                                <Route path="/contacts/:id" element={<ContactDetails />} />

                                <Route path="/movements" element={<Movements />} />
                                <Route path="/movements/new" element={<MovementWizard />} />
                                <Route path="/ai" element={<AIAssistant />} />
                                <Route path="/setup-assistant" element={<RoleBasedRedirect allowedRoles={['admin']}><SetupAssistant /></RoleBasedRedirect>} />
                                <Route path="/integrations" element={<Integrations />} />
                                <Route path="/settings" element={<Settings />} />
                                <Route path="/customizations" element={<Customizations />} />
                                <Route path="/custom/:entitySlug" element={<CustomEntityPage />} />
                                <Route path="/reports/:reportId" element={<CustomReportView />} />
                                <Route path="/checkout/success" element={<CheckoutSuccess />} />
                                <Route path="/checkout/cancel" element={<CheckoutCancel />} />

                            </Route>
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </Suspense>
                </AuthProvider>
                </ImpersonationProvider>
            </HashRouter>
            </SubdomainTenantProvider>
        </TooltipProvider>
    </QueryClientProvider>
    </ErrorBoundary>
);

export default App;
