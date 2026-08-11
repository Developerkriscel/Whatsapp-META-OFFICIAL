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
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

interface LayoutProps {
  children: ReactNode;
  variant: 'superadmin' | 'client';
}

const navItems = {
  superadmin: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/superadmin' },
    { icon: Building2, label: 'Tenants', path: '/superadmin/tenants' },
    { icon: Coins, label: 'Credits', path: '/superadmin/credits' },
    { icon: DollarSign, label: 'Billing Analytics', path: '/superadmin/billing' },
    { icon: Ticket, label: 'Tickets', path: '/superadmin/tickets' },
    { icon: Shield, label: 'System', path: '/superadmin/system' },
    { icon: Settings, label: 'Settings', path: '/superadmin/settings' },
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
    { icon: Settings, label: 'Settings', path: '/settings' },
  ],
};

export default function Layout({ children, variant }: LayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const items = navItems[variant];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[var(--apple-bg)] relative overflow-hidden">
      {/* Apple-style Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="blob-apple-1 -top-40 -left-40" />
        <div className="blob-apple-2 top-1/3 -right-40" />
        <div className="blob-apple-3 bottom-20 left-1/3" />
        <div className="absolute inset-0 bg-grid-apple" />
      </div>

      {/* Apple-style Top Header */}
      <header className="fixed top-0 left-0 right-0 z-30 px-4 pt-3">
        <div className="glass-nav mx-auto rounded-2xl shadow-apple">
          <div className="flex items-center justify-between h-14 px-5">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2.5 hover:bg-black/5 rounded-xl transition-colors"
              >
                <Menu className="w-5 h-5 text-primary-apple" />
              </button>

              {/* Apple-style Logo */}
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
                <div className="w-9 h-9 bg-wa-gradient rounded-xl flex items-center justify-center shadow-wa">
                  <span className="text-white font-semibold text-sm tracking-tight">WA</span>
                </div>
                <div>
                  <h1 className="font-semibold text-wa-green text-sm leading-tight">WA Meta Auto</h1>
                  <p className="text-xs text-secondary-apple leading-tight">WhatsApp Business</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Credits Bar - Only for client variant */}
              {variant === 'client' && <CreditsBar />}

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
                  <div className="w-8 h-8 bg-wa-gradient rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-wa">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                  <ChevronDown className="w-4 h-4 text-secondary-apple hidden sm:block" />
                </button>

                {/* Apple-style Dropdown */}
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-64 glass-panel shadow-apple-lg overflow-hidden">
                      <div className="px-4 py-3.5 border-b border-black/5">
                        <p className="font-semibold text-primary-apple">{user?.name}</p>
                        <p className="text-sm text-secondary-apple">{user?.email}</p>
                      </div>
                      <div className="py-1">
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
          'fixed top-20 left-4 bottom-4 w-64 z-30 transition-all duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
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
                      ? 'bg-wa-gradient text-white shadow-wa'
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
          className="fixed inset-0 bg-black/10 backdrop-blur-xl z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="pt-24 lg:pl-72 p-6 relative z-10">
        <div className="w-full mx-auto">{children}</div>
      </main>
    </div>
  );
}

// Credits Bar Component - Displayed in top header for client
function CreditsBar() {
  const navigate = useNavigate();

  const { data: creditsData, isLoading } = useQuery({
    queryKey: ['credits-balance'],
    queryFn: async () => {
      const response = await api.get('/credits');
      return response.data;
    },
  });

  const credits = creditsData?.data || { balance: 0, used: 0, total: 0 };
  const balance = credits.balance ?? credits.total - credits.used;
  const percentage = credits.total > 0 ? Math.round((credits.used / credits.total) * 100) : 0;

  return (
    <>
      {/* Desktop Credits Bar */}
      <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-xl bg-wa-soft/50 backdrop-blur-sm border border-wa-green/20">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-wa-green" />
          <span className="text-sm font-medium text-primary-apple">Credits:</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-wa-green">{balance.toLocaleString()}</span>
          {credits.total > 0 && (
            <div className="w-20 h-1.5 bg-black/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-wa-gradient rounded-full transition-all"
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          )}
        </div>
        <button
          onClick={() => navigate('/credits')}
          className="px-3 py-1.5 bg-wa-gradient text-white text-xs font-medium rounded-lg hover:opacity-90 transition-opacity shadow-wa flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Buy
        </button>
      </div>

      {/* Mobile Credits Button */}
      <button
        onClick={() => navigate('/credits')}
        className="md:hidden relative p-2.5 hover:bg-black/5 rounded-xl transition-colors"
      >
        <Coins className="w-5 h-5 text-wa-green" />
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-wa-gradient text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-wa">
          {isLoading ? '...' : Math.min(balance, 999)}
        </span>
      </button>
    </>
  );
}
