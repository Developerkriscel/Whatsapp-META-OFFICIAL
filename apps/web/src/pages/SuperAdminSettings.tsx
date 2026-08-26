/**
 * SuperAdmin Settings Page
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Building2,
  Users,
  Shield,
  Bell,
  CreditCard,
  Globe,
  Database,
  Key,
  Save,
  Check,
  Loader2,
} from 'lucide-react';

const TABS = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'integrations', label: 'Integrations', icon: Globe },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'api', label: 'API Keys', icon: Key },
];

export default function SuperAdminSettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [saved, setSaved] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch current settings
  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['superadmin-settings'],
    queryFn: async () => {
      const r = await api.get('/superadmin/settings');
      return r.data.data;
    },
  });

  const settings = settingsData || {};

  const [generalForm, setGeneralForm] = useState({
    platformName: '',
    supportEmail: '',
    tagline: '',
    timezone: 'UTC',
    locale: 'en',
  });

  const [emailSettings, setEmailSettings] = useState({
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpFrom: '',
    emailEnabled: 'false',
  });

  const [securitySettings, setSecuritySettings] = useState({
    requireMFA: 'false',
    sessionTimeout: '24',
    passwordMinLength: '8',
    ipWhitelist: '',
    auditRetention: '90',
  });

  const [billingSettings, setBillingSettings] = useState({
    currency: 'USD',
    taxRate: '0',
    invoicePrefix: 'INV',
    paymentMethods: 'stripe',
    billingEmail: '',
  });

  const [notificationSettings, setNotificationSettings] = useState({
    alertsEmail: '',
    errorAlerts: 'true',
    usageAlerts: 'true',
    billingAlerts: 'true',
    digestFrequency: 'daily',
  });

  // Sync fetched settings into forms once loaded
  useState(() => {
    if (settingsData) {
      setGeneralForm({
        platformName: settingsData.platformName || 'Kriscel WA',
        supportEmail: settingsData.supportEmail || '',
        tagline: settingsData.tagline || '',
        timezone: settingsData.timezone || 'UTC',
        locale: settingsData.locale || 'en',
      });
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await api.patch('/superadmin/settings', data);
      return r.data;
    },
    onSuccess: (_, variables) => {
      const tab = Object.keys(variables).find(k =>
        ['platformName', 'supportEmail', 'tagline'].includes(k)
      ) ? 'general' :
      Object.keys(variables).some(k =>
        ['smtpHost', 'smtpPort', 'smtpUser'].includes(k)
      ) ? 'email' :
      Object.keys(variables).some(k =>
        ['passwordMinLength', 'sessionTimeout', 'auditRetention'].includes(k)
      ) ? 'security' :
      Object.keys(variables).some(k =>
        ['currency', 'taxRate', 'invoicePrefix'].includes(k)
      ) ? 'billing' :
      'notifications';
      setSaved(tab);
      setTimeout(() => setSaved(null), 2000);
      queryClient.invalidateQueries({ queryKey: ['superadmin-settings'] });
    },
  });

  const handleSave = (settings: any) => {
    mutation.mutate(settings);
  };

  const activeTabData = TABS.find(t => t.id === activeTab);

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-wa-green" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ios-dark">Settings</h1>
        <p className="text-ios-secondary mt-1">
          Configure your platform settings and integrations
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0">
          <div className="card-apple p-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-apple-lg text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-wa-green text-white'
                      : 'text-ios-secondary hover:text-ios-dark hover:bg-ios-gray'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* General Settings */}
          {activeTab === 'general' && (
            <>
              <div className="card-apple p-6 mb-6">
                <h2 className="text-lg font-semibold text-ios-dark mb-6 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-wa-green" />
                  General Settings
                </h2>
                <div className="space-y-5">
                  {[
                    { key: 'platformName', label: 'Platform Name', type: 'text' },
                    { key: 'supportEmail', label: 'Support Email', type: 'email' },
                    { key: 'tagline', label: 'Tagline', type: 'text' },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-ios-secondary mb-1.5">{label}</label>
                      <input
                        type={type}
                        value={(generalForm as any)[key]}
                        onChange={(e) => setGeneralForm({ ...generalForm, [key]: e.target.value })}
                        className="input-apple w-full max-w-md"
                      />
                    </div>
                  ))}

                  <div className="grid grid-cols-2 gap-4 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-ios-secondary mb-1.5">Timezone</label>
                      <select
                        value={generalForm.timezone}
                        onChange={(e) => setGeneralForm({ ...generalForm, timezone: e.target.value })}
                        className="input-apple w-full"
                      >
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">Eastern Time</option>
                        <option value="America/Los_Angeles">Pacific Time</option>
                        <option value="Europe/London">London</option>
                        <option value="Asia/Kolkata">India</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ios-secondary mb-1.5">Locale</label>
                      <select
                        value={generalForm.locale}
                        onChange={(e) => setGeneralForm({ ...generalForm, locale: e.target.value })}
                        className="input-apple w-full"
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="pt">Portuguese</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSave(generalForm)}
                    disabled={mutation.isPending}
                    className="btn-apple bg-wa-gradient flex items-center gap-2 disabled:opacity-50"
                  >
                    {saved === 'general' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saved === 'general' ? 'Saved!' : mutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>

              {/* Email Settings */}
              <div className="card-apple p-6">
                <h2 className="text-lg font-semibold text-ios-dark mb-6">Email (SMTP) Settings</h2>
                <div className="grid grid-cols-2 gap-5">
                  {[
                    { key: 'smtpHost', label: 'SMTP Host', type: 'text' },
                    { key: 'smtpPort', label: 'Port', type: 'text' },
                    { key: 'smtpUser', label: 'Username', type: 'text' },
                    { key: 'smtpFrom', label: 'From Name', type: 'text' },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-ios-secondary mb-1.5">{label}</label>
                      <input
                        type={type}
                        value={(emailSettings as any)[key]}
                        onChange={(e) => setEmailSettings({ ...emailSettings, [key]: e.target.value })}
                        className="input-apple w-full"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">SMTP Password</label>
                  <input type="password" className="input-apple w-full max-w-md" placeholder="••••••••" />
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailSettings.emailEnabled === 'true'}
                      onChange={(e) => setEmailSettings({ ...emailSettings, emailEnabled: String(e.target.checked) })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-ios-gray peer-focus:ring-2 peer-focus:ring-wa-green/30 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-wa-green" />
                  </label>
                  <span className="text-sm text-ios-secondary">Enable Email</span>
                </div>

                <button
                  onClick={() => handleSave(emailSettings)}
                  disabled={mutation.isPending}
                  className="btn-apple bg-wa-gradient flex items-center gap-2 mt-5 disabled:opacity-50"
                >
                  {saved === 'email' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saved === 'email' ? 'Saved!' : mutation.isPending ? 'Saving...' : 'Save SMTP Settings'}
                </button>
              </div>
            </>
          )}

          {/* Security */}
          {activeTab === 'security' && (
            <div className="card-apple p-6">
              <h2 className="text-lg font-semibold text-ios-dark mb-6 flex items-center gap-2">
                <Shield className="w-5 h-5 text-apple-purple" />
                Security Settings
              </h2>
              <div className="space-y-5">
                {[
                  { key: 'passwordMinLength', label: 'Minimum Password Length', type: 'text' },
                  { key: 'sessionTimeout', label: 'Session Timeout (hours)', type: 'text' },
                  { key: 'ipWhitelist', label: 'IP Whitelist (comma-separated)', type: 'text' },
                  { key: 'auditRetention', label: 'Audit Log Retention (days)', type: 'text' },
                ].map(({ key, label, type }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-ios-secondary mb-1.5">{label}</label>
                    <input
                      type={type}
                      value={(securitySettings as any)[key]}
                      onChange={(e) => setSecuritySettings({ ...securitySettings, [key]: e.target.value })}
                      className="input-apple w-full max-w-md"
                    />
                  </div>
                ))}

                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={securitySettings.requireMFA === 'true'}
                      onChange={(e) => setSecuritySettings({ ...securitySettings, requireMFA: String(e.target.checked) })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-ios-gray peer-focus:ring-2 peer-focus:ring-wa-green/30 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-wa-green" />
                  </label>
                  <span className="text-sm text-ios-secondary">Require MFA for all admins</span>
                </div>

                <button
                  onClick={() => handleSave(securitySettings)}
                  disabled={mutation.isPending}
                  className="btn-apple bg-wa-gradient flex items-center gap-2 disabled:opacity-50"
                >
                  {saved === 'security' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saved === 'security' ? 'Saved!' : mutation.isPending ? 'Saving...' : 'Save Security Settings'}
                </button>
              </div>
            </div>
          )}

          {/* Billing */}
          {activeTab === 'billing' && (
            <div className="card-apple p-6">
              <h2 className="text-lg font-semibold text-ios-dark mb-6 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-wa-green" />
                Billing Settings
              </h2>
              <div className="grid grid-cols-2 gap-5">
                {[
                  { key: 'currency', label: 'Default Currency', type: 'text' },
                  { key: 'taxRate', label: 'Tax Rate (%)', type: 'text' },
                  { key: 'invoicePrefix', label: 'Invoice Prefix', type: 'text' },
                  { key: 'billingEmail', label: 'Billing Email', type: 'email' },
                ].map(({ key, label, type }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-ios-secondary mb-1.5">{label}</label>
                    <input
                      type={type}
                      value={(billingSettings as any)[key]}
                      onChange={(e) => setBillingSettings({ ...billingSettings, [key]: e.target.value })}
                      className="input-apple w-full"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium text-ios-secondary mb-2">Payment Providers</label>
                <div className="flex gap-3">
                  {['stripe', 'paypal', 'razorpay'].map((provider) => (
                    <label key={provider} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-black/20" />
                      <span className="text-sm text-ios-secondary capitalize">{provider}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleSave(billingSettings)}
                disabled={mutation.isPending}
                className="btn-apple bg-wa-gradient flex items-center gap-2 mt-5 disabled:opacity-50"
              >
                {saved === 'billing' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved === 'billing' ? 'Saved!' : mutation.isPending ? 'Saving...' : 'Save Billing Settings'}
              </button>
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div className="card-apple p-6">
              <h2 className="text-lg font-semibold text-ios-dark mb-6 flex items-center gap-2">
                <Bell className="w-5 h-5 text-apple-orange" />
                Notification Settings
              </h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Alert Email</label>
                  <input
                    type="email"
                    value={notificationSettings.alertsEmail}
                    onChange={(e) => setNotificationSettings({ ...notificationSettings, alertsEmail: e.target.value })}
                    className="input-apple w-full max-w-md"
                  />
                </div>

                <div className="space-y-3">
                  {[
                    { key: 'errorAlerts', label: 'Error Alerts' },
                    { key: 'usageAlerts', label: 'Usage Threshold Alerts' },
                    { key: 'billingAlerts', label: 'Billing Alerts' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(notificationSettings as any)[key] === 'true'}
                          onChange={(e) => setNotificationSettings({ ...notificationSettings, [key]: String(e.target.checked) })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-ios-gray peer-focus:ring-2 peer-focus:ring-wa-green/30 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-wa-green" />
                      </label>
                      <span className="text-sm text-ios-secondary">{label}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Digest Frequency</label>
                  <select
                    value={notificationSettings.digestFrequency}
                    onChange={(e) => setNotificationSettings({ ...notificationSettings, digestFrequency: e.target.value })}
                    className="input-apple w-full max-w-xs"
                  >
                    <option value="realtime">Real-time</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>

                <button
                  onClick={() => handleSave(notificationSettings)}
                  disabled={mutation.isPending}
                  className="btn-apple bg-wa-gradient flex items-center gap-2 disabled:opacity-50"
                >
                  {saved === 'notifications' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saved === 'notifications' ? 'Saved!' : mutation.isPending ? 'Saving...' : 'Save Notification Settings'}
                </button>
              </div>
            </div>
          )}

          {/* Integrations */}
          {activeTab === 'integrations' && (
            <div className="card-apple p-6">
              <h2 className="text-lg font-semibold text-ios-dark mb-6 flex items-center gap-2">
                <Globe className="w-5 h-5 text-wa-green" />
                Integrations
              </h2>
              <div className="space-y-4">
                {[
                  { name: 'Meta Business API', desc: 'WhatsApp Business API connection', status: 'connected' },
                  { name: 'Twilio', desc: 'SMS messaging provider', status: 'disconnected' },
                  { name: 'Stripe', desc: 'Payment processing', status: 'connected' },
                  { name: 'OpenAI', desc: 'AI-powered message generation', status: 'connected' },
                  { name: 'SendGrid', desc: 'Transactional email service', status: 'disconnected' },
                ].map((integration) => (
                  <div key={integration.name} className="flex items-center justify-between p-4 border border-black/5 rounded-apple-lg hover:bg-ios-gray/50 transition">
                    <div>
                      <p className="font-medium text-ios-dark">{integration.name}</p>
                      <p className="text-sm text-ios-muted">{integration.desc}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded-apple-full font-medium ${
                        integration.status === 'connected'
                          ? 'bg-wa-green/20 text-wa-green'
                          : 'bg-ios-gray text-ios-muted'
                      }`}>
                        {integration.status === 'connected' ? 'Connected' : 'Not Connected'}
                      </span>
                      <button className="btn-apple btn-apple-outline text-sm py-1.5">
                        {integration.status === 'connected' ? 'Configure' : 'Connect'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Database */}
          {activeTab === 'database' && (
            <div className="space-y-6">
              <div className="card-apple p-6">
                <h2 className="text-lg font-semibold text-ios-dark mb-6 flex items-center gap-2">
                  <Database className="w-5 h-5 text-red-500" />
                  Database Statistics
                </h2>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Tenants', value: settings.tenants ?? '—', icon: Building2, color: 'blue' },
                    { label: 'Users', value: settings.users ?? '—', icon: Users, color: 'purple' },
                    { label: 'Conversations', value: settings.conversations?.toLocaleString() ?? '—', icon: Globe, color: 'green' },
                    { label: 'Messages', value: settings.messages?.toLocaleString() ?? '—', icon: Database, color: 'orange' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-ios-gray rounded-apple-lg p-4">
                      <p className="text-xs text-ios-muted">{stat.label}</p>
                      <p className="text-xl font-bold text-ios-dark mt-1">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-apple p-6">
                <h2 className="text-lg font-semibold text-ios-dark mb-4">Database Health</h2>
                <div className="space-y-3">
                  {[
                    { label: 'Connection Pool', status: 'healthy', value: '12/50 active' },
                    { label: 'Query Performance', status: 'healthy', value: 'avg 12ms' },
                    { label: 'Storage Used', status: 'warning', value: '78% of 500GB' },
                    { label: 'Last Backup', status: 'healthy', value: '2 hours ago' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-3 border border-black/5 rounded-apple-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          item.status === 'healthy' ? 'bg-wa-green' : item.status === 'warning' ? 'bg-apple-orange' : 'bg-red-500'
                        }`} />
                        <span className="text-sm text-ios-dark">{item.label}</span>
                      </div>
                      <span className="text-sm text-ios-muted">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* API Keys */}
          {activeTab === 'api' && (
            <div className="card-apple p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-ios-dark flex items-center gap-2">
                  <Key className="w-5 h-5 text-apple-indigo" />
                  API Keys
                </h2>
                <button className="btn-apple bg-wa-gradient flex items-center gap-2 text-sm">
                  <Key className="w-4 h-4" />
                  Generate New Key
                </button>
              </div>

              <div className="space-y-3">
                {[
                  { name: 'Production API Key', key: 'wma_prod_••••••••••••••••••••', date: '2026-01-15', perms: 'Full' },
                  { name: 'Development Key', key: 'wma_dev_••••••••••••••••••••••', date: '2026-03-20', perms: 'Read/Write' },
                  { name: 'Analytics Key', key: 'wma_analytics_••••••••••••••••', date: '2026-04-01', perms: 'Read Only' },
                  { name: 'Webhook Key', key: 'wma_webhook_••••••••••••••••••', date: '2026-05-10', perms: 'Write Only' },
                ].map((apiKey) => (
                  <div key={apiKey.name} className="flex items-center justify-between p-4 border border-black/5 rounded-apple-lg hover:bg-ios-gray/50 transition">
                    <div>
                      <p className="font-medium text-ios-dark">{apiKey.name}</p>
                      <p className="text-sm text-ios-muted font-mono mt-1">{apiKey.key}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-ios-muted">Created: {apiKey.date}</span>
                        <span className="text-xs bg-ios-gray text-ios-secondary px-2 py-0.5 rounded-apple">{apiKey.perms}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="btn-apple btn-apple-outline text-sm py-1.5">Copy</button>
                      <button className="btn-apple text-sm py-1.5 text-red-500 hover:bg-red-500/10">Revoke</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="card-apple p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-ios-dark flex items-center gap-2">
                  <Users className="w-5 h-5 text-wa-green" />
                  Platform Users
                </h2>
                <button className="btn-apple bg-wa-gradient flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4" />
                  Invite User
                </button>
              </div>

              <div className="space-y-3">
                {[
                  { name: 'Admin User', email: 'admin@wametaauto.com', role: 'SUPER_ADMIN', status: 'active' },
                  { name: 'Support Agent', email: 'support@wametaauto.com', role: 'SUPPORT', status: 'active' },
                  { name: 'Billing Manager', email: 'billing@wametaauto.com', role: 'BILLING_ADMIN', status: 'active' },
                  { name: 'DevOps Engineer', email: 'devops@wametaauto.com', role: 'SUPPORT', status: 'active' },
                ].map((user) => (
                  <div key={user.email} className="flex items-center justify-between p-4 border border-black/5 rounded-apple-lg hover:bg-ios-gray/50 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center font-semibold">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-ios-dark">{user.name}</p>
                        <p className="text-sm text-ios-muted">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded-apple-full font-medium ${
                        user.role === 'SUPER_ADMIN' ? 'bg-red-500/20 text-red-500' :
                        user.role === 'BILLING_ADMIN' ? 'bg-wa-green/20 text-wa-green' :
                        'bg-wa-green/20 text-wa-green'
                      }`}>
                        {user.role}
                      </span>
                      <span className="text-xs bg-wa-green/20 text-wa-green px-2.5 py-1 rounded-apple-full">Active</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
