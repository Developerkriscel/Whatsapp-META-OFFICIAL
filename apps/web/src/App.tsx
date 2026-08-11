import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Component, ReactNode } from 'react';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PricingPage from './pages/PricingPage';
import DashboardPage from './pages/DashboardPage';
import ContactsPage from './pages/ContactsPage';
import ConversationsPage from './pages/ConversationsPage';
import CampaignsPage from './pages/CampaignsPage';
import TeamPage from './pages/TeamPage';
import SettingsPage from './pages/SettingsPage';
import BillingPage from './pages/BillingPage';
import TemplatesPage from './pages/TemplatesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SegmentsPage from './pages/SegmentsPage';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminTenants from './pages/SuperAdminTenants';
import SuperAdminTickets from './pages/SuperAdminTickets';
import BillingAnalyticsPage from './pages/BillingAnalyticsPage';
import SuperAdminCredits from './pages/SuperAdminCredits';
import SuperAdminSettings from './pages/SuperAdminSettings';
import SuperAdminSystem from './pages/SuperAdminSystem';
import BotFlowsPage from './pages/BotFlowsPage';
import WhatsAppSettingsPage from './pages/WhatsAppSettingsPage';
import CreditsPage from './pages/CreditsPage';

// Components
import Layout from './components/Layout';

// Error Boundary to prevent white screens
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-apple-gray to-white p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-4">{this.state.error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Protected Route Wrapper
function ProtectedRoute({ children, requireSuperadmin = false }: { children: ReactNode; requireSuperadmin?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-apple-gray to-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-wa-green"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperadmin && !user.isSuperadmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Superadmin Layout Wrapper
function SuperadminLayout() {
  const { user } = useAuth();

  if (!user?.isSuperadmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout variant="superadmin">
      <Routes>
        <Route index element={<SuperAdminDashboard />} />
        <Route path="tenants" element={<SuperAdminTenants />} />
        <Route path="tickets" element={<SuperAdminTickets />} />
        <Route path="billing" element={<BillingAnalyticsPage />} />
        <Route path="credits" element={<SuperAdminCredits />} />
        <Route path="system" element={<SuperAdminSystem />} />
        <Route path="settings" element={<SuperAdminSettings />} />
      </Routes>
    </Layout>
  );
}

// Client Layout Wrapper
function ClientLayout() {
  return (
    <Layout variant="client">
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/conversations" element={<ConversationsPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/segments" element={<SegmentsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/whatsapp" element={<WhatsAppSettingsPage />} />
        <Route path="/flows" element={<BotFlowsPage />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Super Admin routes */}
        <Route
          path="/superadmin/*"
          element={
            <ProtectedRoute requireSuperadmin>
              <SuperadminLayout />
            </ProtectedRoute>
          }
        />

        {/* Tenant (client) routes */}
        <Route path="/*" element={<ClientLayout />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
