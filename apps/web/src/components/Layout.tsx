import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Send,
  UserPlus,
  Settings,
  LogOut,
  Building2,
  ClipboardList,
  Ticket,
  Shield,
  Menu,
  CreditCard,
  DollarSign,
  BarChart3,
  Filter,
  FileText,
  Plus,
  Coins,
  ChevronDown,
  Home,
  BookOpen,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatWalletCredits } from '../lib/money';
import NotificationBell from './NotificationBell';
import HeaderAvatar, { AvatarKind } from './HeaderAvatar';

interface LayoutProps {
  children: ReactNode;
  variant: 'superadmin' | 'client';
}

const navItems = {
  superadmin: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/superadmin' },
    { icon: Building2, label: 'Tenants', path: '/superadmin/tenants' },
    { icon: ClipboardList, label: 'Available Plans', path: '/superadmin/plans' },
    { icon: Coins, label: 'Credits', path: '/superadmin/credits' },
    { icon: DollarSign, label: 'Billing Analytics', path: '/superadmin/billing' },
    { icon: Ticket, label: 'Tickets', path: '/superadmin/tickets' },
    { icon: Shield, label: 'System', path: '/superadmin/system' },
  ],
  client: [
    { icon: Home, label: 'Overview', path: '/' },
    { icon: Users, label: 'Contacts', path: '/contacts' },
    { icon: MessageSquare, label: 'Conversations', path: '/conversations' },
    { icon: Send, label: 'Campaigns', path: '/campaigns' },
    { icon: FileText, label: 'Templates', path: '/templates' },
    { icon: Filter, label: 'Segments', path: '/segments' },
    { icon: BarChart3, label: 'Analytics', path: '/analytics' },
    { icon: UserPlus, label: 'Team', path: '/team' },
    { icon: CreditCard, label: 'Billing', path: '/billing' },
    { icon: Coins, label: 'Credits', path: '/credits' },
    { icon: MessageSquare, label: 'WhatsApp', path: '/whatsapp' },
    { icon: FileText, label: 'Chatbot Flows', path: '/flows' },
    { icon: BookOpen, label: 'Terms and Conditions', path: '/terms' },
    { icon: ShieldCheck, label: 'Privacy Policy', path: '/privacy' },
    { icon: RotateCcw, label: 'Return/Refund/Cancellation Policy', path: '/refund-policy' },
  ],
};

export default function Layout({ children, variant }: LayoutProps) {
  const { user, logout, exitImpersonation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const items = navItems[variant];
  // Fetched with the page so the balance is ready when the user menu opens.
  const creditBalance = useCreditBalance(variant === 'client');
  const isImpersonating = !!user?.impersonatedBy;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleExitImpersonation = () => {
    exitImpersonation();
    navigate('/superadmin/tenants');
  };

  return (
    // overflow-x-clip (not overflow-hidden): clips the background blobs
    // sideways without turning this wrapper into a scroll container, which
    // cut off the bottom of long pages on mobile browsers.
    <div className="min-h-screen bg-[var(--apple-bg)] relative overflow-x-clip">
      {/* Apple-style Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="blob-apple-1 -top-40 -left-40" />
        <div className="blob-apple-2 top-1/3 -right-40" />
        <div className="blob-apple-3 bottom-20 left-1/3" />
        <div className="absolute inset-0 bg-grid-apple" />
      </div>

      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-apple-orange text-white text-sm font-medium px-4 py-2 flex items-center justify-center gap-3 shadow-md">
          <span>
            Viewing <strong>{user?.tenantName}</strong> as Superadmin ({user?.impersonatedBy?.name})
          </span>
          <button
            onClick={handleExitImpersonation}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-xs font-semibold transition-colors"
          >
            Exit impersonation
          </button>
        </div>
      )}

      {/* Apple-style Top Header */}
      <header className={clsx('fixed left-0 right-0 z-30 px-2 sm:px-4 pt-3', isImpersonating ? 'top-9' : 'top-0')}>
        <div className="glass-nav mx-auto rounded-2xl shadow-apple">
          <div className="flex items-center justify-between h-14 px-3 sm:px-5">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 sm:p-2.5 hover:bg-black/5 rounded-xl transition-colors shrink-0"
              >
                <Menu className="w-5 h-5 text-primary-apple" />
              </button>

              {/* Logo */}
              <div className="flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0" onClick={() => navigate('/')}>
                {user && <HeaderAvatar kind={pickAvatarKind(user.id, user.avatarGender)} />}
                <div className="min-w-0">
                  <h1 className="font-bold text-[15px] truncate" style={{ color: 'rgb(20, 83, 45)' }}>Kriscel WA</h1>
                  <p className="hidden sm:block text-xs text-secondary-apple leading-tight whitespace-nowrap">Customer Support &amp; CRM Software</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Credits Bar - Only for client variant */}
              {variant === 'client' && <CreditsBar />}

              {/* Sits beside credits because both answer "does anything need me
                  right now" — one about money, one about customers. */}
              {variant === 'client' && <NotificationBell />}

              {/* Apple-style User Menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-3 p-1.5 hover:bg-black/5 rounded-xl transition-colors"
                >
                  <div className="hidden sm:block text-right">
                    <p className="font-medium text-primary-apple text-sm leading-tight">{user?.name}</p>
                    <p className="text-xs text-secondary-apple leading-tight">{user?.email}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full overflow-hidden shadow-wa shrink-0">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-wa-gradient flex items-center justify-center text-white font-semibold text-sm">
                        {user?.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-secondary-apple hidden sm:block" />
                </button>

                {/* Apple-style Dropdown */}
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-64 z-20 bg-white rounded-2xl border border-black/5 shadow-apple-lg overflow-hidden">
                      <div className="px-4 py-3.5 border-b border-black/5">
                        <p className="font-semibold text-primary-apple">{user?.name}</p>
                        <p className="text-sm text-secondary-apple">{user?.email}</p>
                      </div>
                      <div className="py-1">
                        {variant === 'client' && (
                          <CreditsMenuItem credits={creditBalance} onNavigate={() => setUserMenuOpen(false)} />
                        )}
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-apple-red hover:bg-apple-red/5 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Apple-style Sidebar */}
      <aside
        className={clsx(
          'fixed left-4 bottom-4 w-64 z-30 transition-all duration-300 lg:translate-x-0',
          isImpersonating ? 'top-[7.25rem]' : 'top-20',
          // Extra 2rem clears the left-4 offset so no sliver shows when closed.
          sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%+2rem)]'
        )}
      >
        <div className="glass-card h-full shadow-apple overflow-hidden flex flex-col">
          {/* Sidebar Header */}
          <div className="px-5 py-4 border-b border-black/5">
            <p className="text-xs font-semibold text-secondary-apple uppercase tracking-wide">Menu</p>
          </div>

          {/* Apple-style Navigation */}
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {items.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setSidebarOpen(false);
                  }}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all duration-200 text-sm font-medium',
                    isActive
                      ? 'bg-[#0866FF] text-white shadow-[0_2px_8px_rgba(8,102,255,0.3)]'
                      : 'text-primary-apple hover:bg-black/5'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  {isActive && (
                    <div className="ml-auto">
                      <div className="w-1.5 h-1.5 bg-white rounded-full" />
                    </div>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Apple-style Bottom Section */}
          <div className="p-4 border-t border-black/5">
            <button
              onClick={() => navigate(variant === 'superadmin' ? '/superadmin/settings' : '/settings')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors text-primary-apple hover:bg-black/5"
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium text-sm">Settings</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      {/* No z-index here on purpose: `relative` + an explicit z-index
          together create a new stacking context, which caps every
          descendant's z-index at that ceiling — including any full-screen
          modal a page renders inside <main>. That silently let the sidebar
          (z-30, outside <main> at the root level) paint on top of modals
          with a nominally higher z-50/60, across every page in the app.
          `relative` alone (position only, no z-index) doesn't create that
          trap, so modals inside <main> now compare directly against the
          sidebar/header in the root stacking context and correctly win. */}
      <main className={clsx('lg:pl-72 px-4 sm:px-6 pb-16 sm:pb-6 relative', isImpersonating ? 'pt-32' : 'pt-24')}>
        <div className="w-full mx-auto">{children}</div>
      </main>
    </div>
  );
}

function useCreditBalance(enabled = true) {
  const { data: creditsData, isLoading } = useQuery({
    queryKey: ['credits-balance'],
    enabled,
    queryFn: async () => {
      const response = await api.get('/credits');
      return response.data;
    },
  });

  const credits = creditsData?.data || { balance: 0, used: 0, total: 0 };
  const balance = credits.balance ?? credits.total - credits.used;
  return { isLoading, display: formatWalletCredits(balance) };
}

// Buy button in the top header for client. The balance itself lives in the
// user menu, so the header stays uncluttered.
function CreditsBar() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/credits')}
      className="px-3 py-1.5 bg-wa-gradient text-white text-xs font-medium rounded-lg hover:opacity-90 transition-opacity shadow-wa flex items-center gap-1"
    >
      <Plus className="w-3 h-3" />
      <span className="hidden sm:inline">Buy</span>
    </button>
  );
}

// Credit balance row in the user menu, just above Sign Out.
function CreditsMenuItem({
  onNavigate,
  credits,
}: {
  onNavigate: () => void;
  credits: ReturnType<typeof useCreditBalance>;
}) {
  const navigate = useNavigate();
  const { isLoading, display } = credits;

  return (
    <button
      onClick={() => {
        onNavigate();
        navigate('/credits');
      }}
      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-black/5 transition-colors"
    >
      <Coins className="w-4 h-4 text-wa-green" />
      <span className="font-medium text-primary-apple">Credits:</span>
      <span className="font-bold text-wa-green">{isLoading ? '...' : display.credits}</span>
      {!isLoading && <span className="text-xs text-ios-muted">({display.money})</span>}
    </button>
  );
}

// Uses the real per-account preference (set by a superadmin in the Tenants
// panel) when available; otherwise falls back to a consistent per-account
// pick so the same user always sees the same character either way.
function pickAvatarKind(userId: string, preference?: 'boy' | 'girl' | null): AvatarKind {
  if (preference === 'boy' || preference === 'girl') return preference;
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? 'boy' : 'girl';
}
