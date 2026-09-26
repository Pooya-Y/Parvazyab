import "./index.css";
import { DirectionProvider } from "@radix-ui/react-direction";
import { ThemeProvider } from "next-themes";
import { StrictMode, Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { RequireAuth, RequireRole } from "@/components/RequireAuth";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword.tsx"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword.tsx"));
const VerifyEmail = lazy(() => import("./pages/auth/VerifyEmail.tsx"));
const Search = lazy(() => import("./pages/Search.tsx"));
const FlightDetail = lazy(() => import("./pages/FlightDetail.tsx"));
const DashboardLayout = lazy(() => import("./pages/dashboard/DashboardLayout.tsx"));
const DashboardIndex = lazy(() =>
  import("./pages/dashboard/DashboardLayout.tsx").then((m) => ({ default: m.DashboardIndex })),
);
const SavedFlightsPage = lazy(() => import("./pages/dashboard/SavedFlightsPage.tsx"));
const AgencyListingsPage = lazy(() => import("./pages/dashboard/AgencyListingsPage.tsx"));
const AdminOverviewPage = lazy(() => import("./pages/dashboard/AdminOverviewPage.tsx"));
const AccountPage = lazy(() => import("./pages/dashboard/AccountPage.tsx"));
const AlertsPage = lazy(() => import("./pages/dashboard/AlertsPage.tsx"));
const AgencyInsightsPage = lazy(() => import("./pages/dashboard/AgencyInsightsPage.tsx"));
const AgencyToolsPage = lazy(() => import("./pages/dashboard/AgencyToolsPage.tsx"));
const AlertUnsubscribe = lazy(() => import("./pages/AlertUnsubscribe.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Explore = lazy(() => import("./pages/Explore.tsx"));
const Agencies = lazy(() => import("./pages/Agencies.tsx"));
const AgencyProfile = lazy(() => import("./pages/AgencyProfile.tsx"));
const AgencyProfilePage = lazy(() => import("./pages/dashboard/AgencyProfilePage.tsx"));
const ModerationPage = lazy(() => import("./pages/dashboard/ModerationPage.tsx"));
const AdminListingsPage = lazy(() => import("./pages/dashboard/AdminListingsPage.tsx"));
const AuditLogPage = lazy(() => import("./pages/dashboard/AuditLogPage.tsx"));

function RouteLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">در حال بارگذاری…</span>
    </div>
  );
}

/** New page → start at the top (query-string changes such as filters keep the scroll position). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DirectionProvider dir="rtl">
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthProvider>
          <BrowserRouter>
            <ScrollToTop />
            <AppErrorBoundary>
              <Suspense fallback={<RouteLoading />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/explore" element={<Explore />} />
                  <Route path="/agencies" element={<Agencies />} />
                  <Route path="/agencies/:slug" element={<AgencyProfile />} />
                  <Route path="/flight/:id" element={<FlightDetail />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/auth/forgot" element={<ForgotPassword />} />
                  <Route path="/auth/reset" element={<ResetPassword />} />
                  <Route path="/auth/verify-email" element={<VerifyEmail />} />
                  <Route path="/alerts/unsubscribe" element={<AlertUnsubscribe />} />
                  <Route
                    path="/dashboard"
                    element={
                      <RequireAuth>
                        <DashboardLayout />
                      </RequireAuth>
                    }
                  >
                    <Route index element={<DashboardIndex />} />
                    <Route path="saved" element={<SavedFlightsPage />} />
                    <Route path="alerts" element={<AlertsPage />} />
                    <Route path="account" element={<AccountPage />} />
                    <Route
                      path="agency"
                      element={
                        <RequireRole role="agency">
                          <AgencyListingsPage />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="profile"
                      element={
                        <RequireRole role="agency">
                          <AgencyProfilePage />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="insights"
                      element={
                        <RequireRole role="agency">
                          <AgencyInsightsPage />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="tools"
                      element={
                        <RequireRole role="agency">
                          <AgencyToolsPage />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="admin"
                      element={
                        <RequireRole role="admin">
                          <AdminOverviewPage />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="moderation"
                      element={
                        <RequireRole role="admin">
                          <ModerationPage />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="admin/listings"
                      element={
                        <RequireRole role="admin">
                          <AdminListingsPage />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="admin/audit"
                      element={
                        <RequireRole role="admin">
                          <AuditLogPage />
                        </RequireRole>
                      }
                    />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AppErrorBoundary>
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </DirectionProvider>
  </StrictMode>,
);
