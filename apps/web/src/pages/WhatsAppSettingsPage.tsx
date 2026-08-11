/**
 * WhatsApp Settings Page - COMPLETE IMPLEMENTATION
 * All gaps fixed: validation, credentials, business hours, webhooks, quality, bulk import
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Phone, Plus, X, CheckCircle, AlertCircle, Clock, RefreshCw, Trash2,
  ExternalLink, Copy, Check, MessageSquare, Shield, Key, Globe, Settings,
  ChevronDown, ChevronRight, Loader2, Eye, EyeOff, Zap, AlertTriangle,
  BarChart3, TrendingUp, TrendingDown, Users, ShieldCheck, Search,
  Upload, FileText, Send, Bell, BellOff, Sparkles
} from 'lucide-react';
import WhatsAppSetupWizardModal from '../components/WhatsAppSetupWizardModal';

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  displayName?: string;
  metaPhoneId?: string;
  wabaId?: string;
  accessToken?: string;
  status: string;
  qualityScore?: string;
  canSendMarketing: boolean;
  canSendUtility: boolean;
  canSendAuth: boolean;
  verifiedAt?: string;
  createdAt: string;
  dailySentLimit: number;
  todaySentCount: number;
  timezone?: string;
  businessHours?: BusinessHours;
  awayMessage?: string;
  greetingMessage?: string;
  usageStats?: { messagesLast30Days: number; avgDaily: number };
}

interface BusinessHours {
  enabled: boolean;
  monday?: { start: string; end: string };
  tuesday?: { start: string; end: string };
  wednesday?: { start: string; end: string };
  thursday?: { start: string; end: string };
  friday?: { start: string; end: string };
  saturday?: { start: string; end: string };
  sunday?: { start: string; end: string };
}

interface QualityReport {
  qualityScore: string;
  period: string;
  metrics: {
    totalMessages: number;
    deliveryRate: number;
    openRate: number;
    responseRate: number;
    blockRate: number;
    reportRate: number;
  };
  dailyTrend: { date: string; deliveryRate: number; openRate: number; responseRate: number; blockRate: number }[];
  benchmark: { deliveryRate: number; openRate: number; responseRate: number };
  issues: string[];
  recommendations: string[];
}

interface BusinessVerification {
  businessVerified: boolean;
  greenTickEnabled: boolean;
  displayNameApproved: boolean;
  domainVerified: boolean;
  taxIdVerified: boolean;
  businessName?: string;
  taxId?: string;
  steps: { id: string; name: string; status: string; description: string }[];
}

interface RateLimits {
  global: { messagesPerMinute: number; messagesPerHour: number; messagesPerDay: number };
  phones: { id: string; phoneNumber: string; dailySentLimit: number; todaySentCount: number; resetAt: string }[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  pending_verification: { label: 'Pending Verification', color: 'text-apple-orange', bgColor: 'bg-apple-orange/20', icon: Clock },
  verified: { label: 'Verified', color: 'text-apple-green', bgColor: 'bg-apple-green/20', icon: CheckCircle },
  suspended: { label: 'Suspended', color: 'text-apple-red', bgColor: 'bg-apple-red/20', icon: AlertCircle },
  limited: { label: 'Limited', color: 'text-apple-orange', bgColor: 'bg-apple-orange/20', icon: AlertTriangle },
};

const QUALITY_SCORES = {
  GREEN: { label: 'High', color: 'text-apple-green', bgColor: 'bg-apple-green', description: 'Excellent quality - highest delivery rates' },
  YELLOW: { label: 'Medium', color: 'text-apple-orange', bgColor: 'bg-apple-orange', description: 'Average quality - monitor for issues' },
  RED: { label: 'Low', color: 'text-apple-red', bgColor: 'bg-apple-red', description: 'Poor quality - may face restrictions' },
};

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore',
  'Australia/Sydney', 'UTC'
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function WhatsAppSettingsPage() {
  const [activeTab, setActiveTab] = useState<'phones' | 'verification' | 'webhook' | 'credentials' | 'quality' | 'rate-limits'>('phones');
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPhoneDetail, setShowPhoneDetail] = useState<PhoneNumber | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [qualityPeriod, setQualityPeriod] = useState<'7' | '30' | '90'>('30');
  const [addForm, setAddForm] = useState({
    phoneNumber: '',
    displayName: '',
    metaPhoneId: '',
    wabaId: '',
    accessToken: '',
  });
  const [formErrors, setFormErrors] = useState<{ phoneNumber?: string; displayName?: string }>({});
  const [bulkImportText, setBulkImportText] = useState('');
  const [editCredentials, setEditCredentials] = useState({
    appId: '',
    appSecret: '',
    accessToken: '',
    wabaId: '',
  });
  const [isEditingCredentials, setIsEditingCredentials] = useState(false);
  const queryClient = useQueryClient();

  // Fetch WhatsApp data
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp-settings'],
    queryFn: async () => {
      const [phoneRes, webhookRes, credentialsRes, verificationRes, rateLimitRes] = await Promise.all([
        api.get('/whatsapp/phone-numbers', { params: searchQuery ? { search: searchQuery } : {} }),
        api.get('/whatsapp/webhook-url'),
        api.get('/whatsapp/credentials'),
        api.get('/whatsapp/business-verification'),
        api.get('/whatsapp/rate-limits'),
      ]);
      return {
        phones: phoneRes.data,
        webhook: webhookRes.data,
        credentials: credentialsRes.data,
        verification: verificationRes.data,
        rateLimits: rateLimitRes.data,
      };
    },
    refetchInterval: 30000,
  });

  // Quality report query
  const qualityQuery = useQuery({
    queryKey: ['whatsapp-quality', selectedPhone, qualityPeriod],
    queryFn: async () => {
      const res = await api.get(`/whatsapp/quality-report/${selectedPhone}`, { params: { period: qualityPeriod } });
      return res.data;
    },
    enabled: !!selectedPhone,
  });

  // Webhook settings query
  const webhookSettingsQuery = useQuery({
    queryKey: ['whatsapp-webhook-settings'],
    queryFn: async () => {
      const res = await api.get('/whatsapp/webhook/settings');
      return res.data;
    },
  });

  // Mutations
  const addPhoneMutation = useMutation({
    mutationFn: async (payload: typeof addForm) => {
      const response = await api.post('/whatsapp/phone-numbers', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      setShowAddModal(false);
      setAddForm({ phoneNumber: '', displayName: '', metaPhoneId: '', wabaId: '', accessToken: '' });
      setFormErrors({});
    },
    onError: (err: any) => {
      if (err.response?.data?.error?.code === 'DUPLICATE') {
        setFormErrors({ phoneNumber: 'This phone number is already connected' });
      } else if (err.response?.data?.error?.code === 'LIMIT_EXCEEDED') {
        setFormErrors({ phoneNumber: err.response.data.error.message });
      } else {
        setFormErrors({ phoneNumber: err.response?.data?.message || 'Failed to add phone' });
      }
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (text: string) => {
      const lines = text.split('\n').filter(l => l.trim());
      const phoneNumbers = lines.map(line => {
        const parts = line.split(',').map(p => p.trim());
        return {
          phoneNumber: parts[0].replace(/[^\d+]/g, ''),
          displayName: parts[1] || undefined,
        };
      }).filter(p => p.phoneNumber);

      const response = await api.post('/whatsapp/phone-numbers/bulk-import', { phoneNumbers });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      setShowBulkImport(false);
      setBulkImportText('');
    },
  });

  const updatePhoneMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await api.patch(`/whatsapp/phone-numbers/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      if (showPhoneDetail) {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-quality', showPhoneDetail.id] });
      }
    },
  });

  const deletePhoneMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/whatsapp/phone-numbers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      setShowPhoneDetail(null);
    },
  });

  const refreshQualityMutation = useMutation({
    mutationFn: async (phoneId: string) => {
      const response = await api.post(`/whatsapp/phone-numbers/${phoneId}/refresh-quality`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
    },
  });

  const testCredentialsMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/whatsapp/credentials/test');
      return response.data;
    },
  });

  const saveCredentialsMutation = useMutation({
    mutationFn: async (creds: typeof editCredentials) => {
      const response = await api.post('/whatsapp/credentials', creds);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      setIsEditingCredentials(false);
    },
  });

  const testMessageMutation = useMutation({
    mutationFn: async (phoneId: string) => {
      const response = await api.post('/whatsapp/credentials/send-test', { phoneNumberId: phoneId });
      return response.data;
    },
  });

  const testWebhookMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/whatsapp/webhook/test');
      return response.data;
    },
  });

  const updateWebhookSettingsMutation = useMutation({
    mutationFn: async (settings: any) => {
      const response = await api.patch('/whatsapp/webhook/settings', settings);
      return response.data;
    },
  });

  const phones: PhoneNumber[] = data?.phones?.data || [];
  const webhookUrl = data?.webhook?.data?.webhookUrl || '';
  const credentials = data?.credentials?.data || {};
  const verification: BusinessVerification = data?.verification?.data || { steps: [] };
  const rateLimits: RateLimits = data?.rateLimits?.data || { global: { messagesPerMinute: 250, messagesPerHour: 5000, messagesPerDay: 100000 }, phones: [] };
  const qualityReport: QualityReport = qualityQuery.data?.data || null;
  const webhookSettings = webhookSettingsQuery.data?.data || { fields: {}, retrySettings: {} };

  // Populate edit form when credentials load (never pre-fill secret/token — user must re-enter)
  useEffect(() => {
    if (credentials?.appId) {
      setEditCredentials({
        appId: credentials.appId || '',
        appSecret: '',
        accessToken: '',
        wabaId: credentials.wabaId || '',
      });
    }
  }, [credentials]);

  const validatePhone = (value: string): string | undefined => {
    if (!value) return 'Phone number is required';
    if (!/^\+?[1-9]\d{6,14}$/.test(value.replace(/\s/g, ''))) {
      return 'Invalid format. Use E.164: +1234567890';
    }
    return undefined;
  };

  const handleAddPhone = async () => {
    const errors: typeof formErrors = {};
    const phoneError = validatePhone(addForm.phoneNumber);
    if (phoneError) errors.phoneNumber = phoneError;
    if (!addForm.metaPhoneId) errors.phoneNumber = 'Meta Phone Number ID is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      if (addForm.accessToken || addForm.wabaId) {
        await api.post('/whatsapp/credentials', {
          appId: credentials?.appId || '1502654484880767',
          appSecret: credentials?.appSecret || '',
          wabaId: addForm.wabaId || '1029485569660598',
          accessToken: addForm.accessToken,
        });
      }

      addPhoneMutation.mutate({
        phoneNumber: addForm.phoneNumber,
        displayName: addForm.displayName,
        metaPhoneId: addForm.metaPhoneId,
        wabaId: addForm.wabaId,
        accessToken: addForm.accessToken,
      });
    } catch (e: any) {
      setFormErrors({ phoneNumber: e?.message || 'Failed saving credentials' });
    }
  };

  const copyToClipboard = (text: string, type: 'webhook' | 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'webhook') setCopiedWebhook(true);
    else setCopiedToken(true);
    setTimeout(() => {
      if (type === 'webhook') setCopiedWebhook(false);
      else setCopiedToken(false);
    }, 2000);
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  const getUsagePercentage = (used: number, limit: number) => Math.min(100, Math.round((used / limit) * 100));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-wa">WhatsApp Settings</h1>
          <p className="text-ios-secondary mt-1">Configure your WhatsApp Business integration</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWizardModal(true)}
            className="px-4 py-2 bg-wa-green text-white font-semibold text-sm rounded-apple-lg hover:bg-wa-green/90 transition shadow-sm flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Launch Setup Wizard
          </button>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="btn-apple btn-apple-outline flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Quick Setup Wizard Banner */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-apple-2xl shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-700">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-apple-xl bg-wa-green/20 text-wa-green flex items-center justify-center font-bold text-xl border border-wa-green/30 shrink-0">
            <Sparkles className="w-6 h-6 text-wa-green" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              WhatsApp Connection Wizard
              <span className="text-xs bg-wa-green text-white px-2 py-0.5 rounded-full font-semibold">Recommended</span>
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Step-by-step setup for Meta App ID, WABA ID, Permanent Token, Phone Number & Meta Phone ID with visual Facebook UI previews.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowWizardModal(true)}
          className="px-5 py-2.5 bg-wa-green text-white font-semibold text-sm rounded-apple-xl hover:bg-wa-green/90 transition shadow-md shrink-0 flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          Start Setup Wizard
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-black/10">
        <div className="flex gap-1 overflow-x-auto">
          {[
            { id: 'phones', label: 'Phone Numbers', icon: Phone },
            { id: 'verification', label: 'Verification', icon: ShieldCheck },
            { id: 'webhook', label: 'Webhook', icon: Globe },
            { id: 'credentials', label: 'API Credentials', icon: Key },
            { id: 'quality', label: 'Quality', icon: TrendingUp },
            { id: 'rate-limits', label: 'Rate Limits', icon: Bell },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-wa-green text-wa-green'
                  : 'border-transparent text-ios-muted hover:text-ios-dark'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Phone Numbers Tab */}
      {activeTab === 'phones' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="card-apple p-4">
              <p className="text-sm text-ios-muted">Total Phones</p>
              <p className="text-2xl font-bold text-ios-dark">{phones.length}</p>
            </div>
            <div className="card-apple p-4">
              <p className="text-sm text-ios-muted">Verified</p>
              <p className="text-2xl font-bold text-apple-green">{phones.filter(p => p.status === 'verified').length}</p>
            </div>
            <div className="card-apple p-4">
              <p className="text-sm text-ios-muted">High Quality</p>
              <p className="text-2xl font-bold text-apple-green">{phones.filter(p => p.qualityScore === 'GREEN').length}</p>
            </div>
            <div className="card-apple p-4">
              <p className="text-sm text-ios-muted">Messages Today</p>
              <p className="text-2xl font-bold text-ios-dark">{phones.reduce((sum, p) => sum + (p.todaySentCount || 0), 0)}</p>
            </div>
          </div>

          {/* Search & Actions */}
          <div className="card-apple p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search phone numbers..."
                  className="input-apple pl-10 w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkImport(true)}
                  className="btn-apple btn-apple-outline flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Bulk Import
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="btn-apple btn-wa-green flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Phone
                </button>
              </div>
            </div>
          </div>

          {/* Phone Numbers List */}
          <div className="card-apple">
            <div className="p-4 border-b border-black/5">
              <h2 className="font-semibold text-ios-dark">Connected Phone Numbers</h2>
            </div>

            {phones.length === 0 ? (
              <div className="p-12 text-center">
                <Phone className="w-12 h-12 text-ios-muted mx-auto mb-4 opacity-50" />
                <p className="text-ios-secondary font-medium">No phone numbers found</p>
                <p className="text-sm text-ios-muted mt-1">Add your first WhatsApp Business number</p>
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {phones.map((phone) => {
                  const status = STATUS_CONFIG[phone.status] || STATUS_CONFIG.pending_verification;
                  const quality = QUALITY_SCORES[phone.qualityScore as keyof typeof QUALITY_SCORES] || QUALITY_SCORES.GREEN;
                  const usagePct = getUsagePercentage(phone.todaySentCount || 0, phone.dailySentLimit || 1000);

                  return (
                    <div key={phone.id} className="p-4 hover:bg-ios-gray/30 transition border-b border-black/5 last:border-b-0">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start md:items-center gap-4">
                          <div className="w-12 h-12 bg-wa-green/20 rounded-apple-xl flex items-center justify-center shrink-0">
                            <Phone className="w-6 h-6 text-wa-green" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-ios-dark text-base">{phone.displayName || phone.phoneNumber}</p>
                              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${status.bgColor} ${status.color}`}>
                                {status.label}
                              </span>
                              {phone.qualityScore && (
                                <span className={`px-2 py-0.5 text-xs rounded-full flex items-center gap-1 ${quality.bgColor}/20 ${quality.color}`}>
                                  <div className={`w-2 h-2 rounded-full ${quality.bgColor}`} />
                                  {quality.label} Quality
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm">
                              <span className="font-mono text-ios-dark font-medium">{phone.phoneNumber}</span>
                              {phone.metaPhoneId && (
                                <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                  <Shield className="w-3 h-3 text-wa-green" />
                                  Meta Phone ID: <code className="font-bold">{phone.metaPhoneId}</code>
                                </span>
                              )}
                              {phone.timezone && (
                                <span className="text-xs text-ios-muted">Timezone: {phone.timezone}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex gap-1 mr-2">
                            {phone.canSendMarketing && <span className="badge-apple badge-purple" title="Marketing Allowed">MKT</span>}
                            {phone.canSendUtility && <span className="badge-apple badge-green" title="Utility Allowed">UTL</span>}
                            {phone.canSendAuth && <span className="badge-apple badge-blue" title="Authentication Allowed">AUTH</span>}
                          </div>
                          <button
                            onClick={() => { setShowPhoneDetail(phone); setSelectedPhone(phone.id); }}
                            className="btn-apple btn-apple-outline text-xs px-3 py-1.5 flex items-center gap-1.5"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            Setup & Meta Config
                          </button>
                          <button
                            onClick={() => { if (confirm('Delete this phone number?')) deletePhoneMutation.mutate(phone.id); }}
                            className="p-2 hover:bg-apple-red/10 rounded-apple-lg text-ios-muted hover:text-apple-red transition"
                            title="Delete phone number"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {/* Daily usage bar */}
                      <div className="mt-3 flex items-center gap-3 text-xs text-ios-muted bg-slate-50/80 p-2 rounded-apple-lg border border-slate-200/60">
                        <span className="font-medium text-slate-600">Daily Message Volume:</span>
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden max-w-[250px]">
                          <div
                            className={`h-full transition-all ${usagePct > 80 ? 'bg-apple-red' : usagePct > 60 ? 'bg-apple-orange' : 'bg-wa-green'}`}
                            style={{ width: `${usagePct}%` }}
                          />
                        </div>
                        <span className="font-semibold text-slate-700">{(phone.todaySentCount || 0).toLocaleString()} / {phone.dailySentLimit?.toLocaleString()} ({usagePct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Verification Tab */}
      {activeTab === 'verification' && (
        <div className="space-y-6">
          {/* Verification Status Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-ios-muted">Business Verification</p>
                  <p className={`text-2xl font-bold mt-1 ${verification.businessVerified ? 'text-apple-green' : 'text-apple-orange'}`}>
                    {verification.businessVerified ? 'Verified' : 'Pending'}
                  </p>
                  {verification.businessName && (
                    <p className="text-sm text-ios-secondary mt-1">{verification.businessName}</p>
                  )}
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${verification.businessVerified ? 'bg-apple-green/20' : 'bg-apple-orange/20'}`}>
                  {verification.businessVerified ? <CheckCircle className="w-6 h-6 text-apple-green" /> : <Clock className="w-6 h-6 text-apple-orange" />}
                </div>
              </div>
            </div>
            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-ios-muted">Green Tick</p>
                  <p className={`text-2xl font-bold mt-1 ${verification.greenTickEnabled ? 'text-apple-green' : 'text-ios-muted'}`}>
                    {verification.greenTickEnabled ? 'Enabled' : 'Not Available'}
                  </p>
                  <p className="text-xs text-ios-muted mt-1">Requires business verification</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${verification.greenTickEnabled ? 'bg-apple-green/20' : 'bg-ios-gray'}`}>
                  <ShieldCheck className={`w-6 h-6 ${verification.greenTickEnabled ? 'text-apple-green' : 'text-ios-muted'}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Tax ID Section */}
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-4">Tax ID / Business ID</h2>
            {verification.taxId ? (
              <div className="flex items-center gap-3 p-4 bg-apple-green/10 rounded-apple-lg">
                <CheckCircle className="w-5 h-5 text-apple-green" />
                <div>
                  <p className="font-medium text-ios-dark">Tax ID on file</p>
                  <p className="text-sm text-ios-muted">{verification.taxId}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-ios-gray/50 rounded-apple-lg">
                <AlertTriangle className="w-5 h-5 text-apple-orange" />
                <p className="text-sm text-ios-secondary">No tax ID on file. Contact support to add.</p>
              </div>
            )}
          </div>

          {/* Verification Steps */}
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-4">Verification Checklist</h2>
            <div className="space-y-3">
              {verification.steps?.map((step, index) => (
                <div key={step.id} className="flex items-center gap-4 p-4 bg-ios-gray/50 rounded-apple-lg">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step.status === 'completed' ? 'bg-apple-green text-white' :
                    step.status === 'in_progress' ? 'bg-apple-orange text-white' :
                    'bg-ios-gray text-ios-muted'
                  }`}>
                    {step.status === 'completed' ? <Check className="w-4 h-4" /> : index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-ios-dark">{step.name}</p>
                    <p className="text-sm text-ios-muted">{step.description}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    step.status === 'completed' ? 'bg-apple-green/20 text-apple-green' :
                    step.status === 'in_progress' ? 'bg-apple-orange/20 text-apple-orange' :
                    'bg-ios-gray text-ios-muted'
                  }`}>
                    {step.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Webhook Tab */}
      {activeTab === 'webhook' && (
        <div className="space-y-4">
          {/* Webhook URL */}
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-2">Webhook URL</h2>
            <p className="text-sm text-ios-muted mb-4">
              Add this URL in your Meta App's WhatsApp &gt; Configuration &gt; Webhooks section.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-ios-gray rounded-apple-lg px-4 py-3 font-mono text-sm text-ios-dark overflow-x-auto">
                {webhookUrl || 'Configure API Credentials first'}
              </div>
              <button
                onClick={() => copyToClipboard(webhookUrl, 'webhook')}
                className="btn-apple btn-apple-outline flex items-center gap-2"
              >
                {copiedWebhook ? <Check className="w-4 h-4 text-apple-green" /> : <Copy className="w-4 h-4" />}
                {copiedWebhook ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Verify Token */}
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-2">Webhook Verify Token</h2>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-ios-gray rounded-apple-lg px-4 py-3 font-mono text-sm text-ios-dark">
                WHATSAPP_VERIFY_TOKEN
              </div>
            </div>
            <p className="text-xs text-ios-muted mt-2">
              Set this as the Verify Token in your Meta webhook settings
            </p>
          </div>

          {/* Webhook Fields */}
          <div className="card-apple p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-ios-dark">Webhook Fields</h2>
            </div>
            <p className="text-sm text-ios-muted mb-4">Enable these fields in your Meta webhook subscription:</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(webhookSettings.fields || {}).map(([field, enabled]) => (
                <div key={field} className="flex items-center gap-2 p-3 bg-ios-gray rounded-apple-lg">
                  <CheckCircle className={`w-4 h-4 ${enabled ? 'text-apple-green' : 'text-ios-muted'}`} />
                  <span className={`text-sm ${enabled ? 'text-ios-dark' : 'text-ios-muted'}`}>
                    {field.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Test Webhook */}
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-4">Test Webhook</h2>
            <button
              onClick={() => testWebhookMutation.mutate()}
              disabled={testWebhookMutation.isPending}
              className="btn-apple btn-wa-green flex items-center gap-2"
            >
              {testWebhookMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {testWebhookMutation.isPending ? 'Testing...' : 'Send Test Notification'}
            </button>
            {testWebhookMutation.isSuccess && (
              <div className="flex items-center gap-2 p-4 bg-apple-green/10 rounded-apple-lg mt-4">
                <CheckCircle className="w-5 h-5 text-apple-green" />
                <p className="text-sm text-apple-green">Test notification sent successfully!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Credentials Tab */}
      {activeTab === 'credentials' && (
        <div className="card-apple p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ios-dark">Meta API Credentials</h2>
              <p className="text-sm text-ios-muted">Configure your WhatsApp Business API credentials - stored per-tenant</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsEditingCredentials(true);
                  setEditCredentials({
                    appId: credentials.appId || '',
                    appSecret: '',
                    wabaId: credentials.wabaId || '',
                    accessToken: '',
                  });
                }}
                className="px-3 py-1.5 bg-wa-green/20 text-wa-green font-bold text-xs rounded-apple-lg hover:bg-wa-green/30 transition flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5 text-wa-green" /> Auto-Fill Meta Credentials
              </button>
              {credentials.isConfigured && (
                <span className="px-3 py-1 bg-apple-green/20 text-apple-green text-sm rounded-full flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Configured
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">App ID</label>
                <input
                  type="text"
                  value={editCredentials.appId}
                  onChange={(e) => setEditCredentials({...editCredentials, appId: e.target.value})}
                  className="input-apple w-full"
                  placeholder="1234567890123456"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">WABA ID</label>
                <input
                  type="text"
                  value={editCredentials.wabaId}
                  onChange={(e) => setEditCredentials({...editCredentials, wabaId: e.target.value})}
                  className="input-apple w-full"
                  placeholder="WhatsApp Business Account ID"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ios-secondary mb-1.5">
                App Secret
                {credentials.hasAppSecret && !isEditingCredentials && (
                  <span className="ml-2 text-xs text-apple-green font-normal">● Saved</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showCredentials ? 'text' : 'password'}
                  value={editCredentials.appSecret}
                  onChange={(e) => setEditCredentials({...editCredentials, appSecret: e.target.value})}
                  className="input-apple w-full pr-10"
                  placeholder={credentials.hasAppSecret ? 'Leave blank to keep existing secret' : 'Enter your Meta App Secret'}
                  disabled={!isEditingCredentials}
                />
                <button onClick={() => setShowCredentials(!showCredentials)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-muted">
                  {showCredentials ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-ios-secondary">
                  Access Token
                  {credentials.hasAccessToken && !isEditingCredentials && (
                    <span className="ml-2 text-xs text-apple-green font-normal">● Saved</span>
                  )}
                </label>
                {editCredentials.accessToken && (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    editCredentials.accessToken.startsWith('EAAV')
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}>
                    {editCredentials.accessToken.startsWith('EAAV')
                      ? '⚠️ Temporary 24h Token (Expires Daily)'
                      : '✅ Permanent System User Token (Never Expire)'}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showCredentials ? 'text' : 'password'}
                  value={editCredentials.accessToken}
                  onChange={(e) => setEditCredentials({...editCredentials, accessToken: e.target.value})}
                  className="input-apple w-full pr-10 font-mono text-xs"
                  placeholder={credentials.hasAccessToken ? 'Leave blank to keep existing token' : 'Enter your Access Token'}
                  disabled={!isEditingCredentials}
                />
                <button onClick={() => setShowCredentials(!showCredentials)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-muted">
                  {showCredentials ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-ios-muted mt-1.5">
                💡 <strong>Tip for Permanent Token</strong>: In Meta Business Manager (`business.facebook.com &rarr; System Users`), create an Admin System User to generate a token set to <em>'Never Expire'</em>.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              {!isEditingCredentials ? (
                <>
                  <button
                    onClick={() => setIsEditingCredentials(true)}
                    className="btn-apple btn-apple-blue flex items-center gap-2"
                  >
                    <Key className="w-4 h-4" />
                    Edit Credentials
                  </button>
                  <button
                    onClick={() => testCredentialsMutation.mutate()}
                    disabled={testCredentialsMutation.isPending}
                    className="btn-apple btn-apple-outline flex items-center gap-2"
                  >
                    {testCredentialsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Test Connection
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => saveCredentialsMutation.mutate(editCredentials)}
                    disabled={saveCredentialsMutation.isPending}
                    className="btn-apple btn-wa-green flex items-center gap-2"
                  >
                    {saveCredentialsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Save Credentials
                  </button>
                  <button
                    onClick={() => setIsEditingCredentials(false)}
                    className="btn-apple btn-apple-outline flex items-center gap-2"
                  >
                    Cancel
                  </button>
                </>
              )}
              {phones.length > 0 && !isEditingCredentials && (
                <button
                  onClick={() => testMessageMutation.mutate(phones[0].id)}
                  disabled={testMessageMutation.isPending}
                  className="btn-apple btn-apple-outline flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send Test Message
                </button>
              )}
            </div>

            {testCredentialsMutation.isSuccess && (
              <div className="flex items-center gap-2 p-4 bg-apple-green/10 rounded-apple-lg">
                <CheckCircle className="w-5 h-5 text-apple-green" />
                <p className="text-sm text-apple-green">Credentials are valid and connected!</p>
              </div>
            )}

            {testCredentialsMutation.isError && (
              <div className="flex items-center gap-2 p-4 bg-apple-red/10 rounded-apple-lg">
                <AlertCircle className="w-5 h-5 text-apple-red" />
                <p className="text-sm text-apple-red">Connection failed. Please check your credentials.</p>
              </div>
            )}

            {testMessageMutation.isSuccess && (
              <div className="flex items-center gap-2 p-4 bg-apple-green/10 rounded-apple-lg">
                <Send className="w-5 h-5 text-apple-green" />
                <p className="text-sm text-apple-green">Test message sent successfully!</p>
              </div>
            )}

            <p className="text-xs text-ios-muted mt-2">
              💡 Each tenant stores their own WhatsApp credentials securely. No server configuration needed.
            </p>
          </div>
        </div>
      )}

      {/* Quality Tab */}
      {activeTab === 'quality' && (
        <div className="space-y-6">
          {/* Phone Selector */}
          {phones.length > 0 && (
            <div className="card-apple p-4">
              <label className="block text-sm font-medium text-ios-secondary mb-2">Select Phone Number</label>
              <select
                value={selectedPhone || ''}
                onChange={(e) => setSelectedPhone(e.target.value || null)}
                className="input-apple w-full max-w-md"
              >
                <option value="">Choose a phone number...</option>
                {phones.map(p => (
                  <option key={p.id} value={p.id}>{p.displayName || p.phoneNumber}</option>
                ))}
              </select>
            </div>
          )}

          {selectedPhone && qualityReport ? (
            <>
              {/* Quality Score */}
              <div className="card-apple p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-ios-dark">Quality Score</h2>
                  <div className="flex gap-2">
                    {(['7', '30', '90'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setQualityPeriod(p)}
                        className={`px-3 py-1 text-sm rounded-apple-lg ${qualityPeriod === p ? 'bg-wa-green text-white' : 'bg-ios-gray text-ios-muted'}`}
                      >
                        {p}D
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-apple-xl ${
                  qualityReport.qualityScore === 'GREEN' ? 'bg-apple-green/20 text-apple-green' :
                  qualityReport.qualityScore === 'YELLOW' ? 'bg-apple-orange/20 text-apple-orange' :
                  'bg-apple-red/20 text-apple-red'
                }`}>
                  <div className={`w-3 h-3 rounded-full ${
                    qualityReport.qualityScore === 'GREEN' ? 'bg-apple-green' :
                    qualityReport.qualityScore === 'YELLOW' ? 'bg-apple-orange' :
                    'bg-apple-red'
                  }`} />
                  <span className="font-semibold">
                    {qualityReport.qualityScore === 'GREEN' ? 'High' : qualityReport.qualityScore === 'YELLOW' ? 'Medium' : 'Low'}
                  </span>
                  <span className="text-sm opacity-70">({qualityReport.period})</span>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-4 gap-4">
                <div className="card-apple p-4 text-center">
                  <p className="text-3xl font-bold text-apple-green">{qualityReport.metrics.deliveryRate}%</p>
                  <p className="text-sm text-ios-muted">Delivery Rate</p>
                  <p className="text-xs text-ios-muted mt-1">Benchmark: {qualityReport.benchmark.deliveryRate}%</p>
                </div>
                <div className="card-apple p-4 text-center">
                  <p className="text-3xl font-bold text-apple-green">{qualityReport.metrics.openRate}%</p>
                  <p className="text-sm text-ios-muted">Open Rate</p>
                  <p className="text-xs text-ios-muted mt-1">Benchmark: {qualityReport.benchmark.openRate}%</p>
                </div>
                <div className="card-apple p-4 text-center">
                  <p className="text-3xl font-bold text-apple-orange">{qualityReport.metrics.responseRate}%</p>
                  <p className="text-sm text-ios-muted">Response Rate</p>
                  <p className="text-xs text-ios-muted mt-1">Benchmark: {qualityReport.benchmark.responseRate}%</p>
                </div>
                <div className="card-apple p-4 text-center">
                  <p className="text-3xl font-bold text-apple-red">{qualityReport.metrics.blockRate}%</p>
                  <p className="text-sm text-ios-muted">Block Rate</p>
                  <p className="text-xs text-ios-muted mt-1">Keep below 1%</p>
                </div>
              </div>

              {/* Issues */}
              {qualityReport.issues.length > 0 && (
                <div className="card-apple p-6 border-l-4 border-apple-red">
                  <h3 className="font-semibold text-apple-red mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> Issues Detected
                  </h3>
                  <ul className="space-y-2">
                    {qualityReport.issues.map((issue, i) => (
                      <li key={i} className="text-sm text-ios-secondary flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-apple-red rounded-full" />{issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              <div className="card-apple p-6">
                <h3 className="font-semibold text-ios-dark mb-3">Recommendations</h3>
                <ul className="space-y-2">
                  {qualityReport.recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-ios-secondary flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-apple-green" />{rec}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <div className="card-apple p-12 text-center">
              <TrendingUp className="w-12 h-12 text-ios-muted mx-auto mb-4 opacity-50" />
              <p className="text-ios-secondary font-medium">Select a phone number</p>
              <p className="text-sm text-ios-muted mt-1">Choose from the dropdown above to view quality metrics</p>
            </div>
          )}
        </div>
      )}

      {/* Rate Limits Tab */}
      {activeTab === 'rate-limits' && (
        <div className="space-y-6">
          {/* Global Limits */}
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-4">Global Rate Limits</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-ios-gray rounded-apple-lg">
                <p className="text-3xl font-bold text-ios-dark">{rateLimits.global.messagesPerMinute}</p>
                <p className="text-sm text-ios-muted">Messages / Minute</p>
              </div>
              <div className="text-center p-4 bg-ios-gray rounded-apple-lg">
                <p className="text-3xl font-bold text-ios-dark">{rateLimits.global.messagesPerHour.toLocaleString()}</p>
                <p className="text-sm text-ios-muted">Messages / Hour</p>
              </div>
              <div className="text-center p-4 bg-ios-gray rounded-apple-lg">
                <p className="text-3xl font-bold text-ios-dark">{rateLimits.global.messagesPerDay.toLocaleString()}</p>
                <p className="text-sm text-ios-muted">Messages / Day</p>
              </div>
            </div>
          </div>

          {/* Per-Phone Limits */}
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-4">Per-Phone Limits</h2>
            <div className="space-y-3">
              {rateLimits.phones.map(phone => {
                const usage = getUsagePercentage(phone.todaySentCount, phone.dailySentLimit);
                return (
                  <div key={phone.id} className="p-4 bg-ios-gray/50 rounded-apple-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-ios-dark">{phone.phoneNumber}</p>
                      <p className="text-sm text-ios-muted">
                        {phone.todaySentCount.toLocaleString()} / {phone.dailySentLimit.toLocaleString()}
                      </p>
                    </div>
                    <div className="h-2 bg-ios-gray rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${usage > 80 ? 'bg-apple-red' : usage > 60 ? 'bg-apple-orange' : 'bg-wa-green'}`}
                        style={{ width: `${usage}%` }}
                      />
                    </div>
                    {phone.resetAt && (
                      <p className="text-xs text-ios-muted mt-2">
                        Resets at: {new Date(phone.resetAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add Phone Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto border border-black/10 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-black/5 pb-3">
              <div>
                <h3 className="text-lg font-bold text-ios-dark flex items-center gap-2">
                  <Phone className="w-5 h-5 text-wa-green" /> Add WhatsApp Phone Line (Meta Console Sync)
                </h3>
                <p className="text-xs text-ios-muted">Matches developers.facebook.com -&gt; WhatsApp -&gt; API Setup</p>
              </div>
              <button onClick={() => { setShowAddModal(false); setFormErrors({}); }} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>



            <div className="space-y-4">

              {/* 1. Phone Number */}
              <div>
                <label className="block text-xs font-bold text-ios-dark mb-1">
                  1. Phone Number <span className="text-apple-red">*</span> <span className="text-[11px] font-normal text-ios-muted">(e.g. Test Number or Production Line)</span>
                </label>
                <input
                  type="tel"
                  value={addForm.phoneNumber}
                  onChange={(e) => { setAddForm({ ...addForm, phoneNumber: e.target.value }); setFormErrors({}); }}
                  placeholder="+15551949254 or +919074271866"
                  className={`input-apple w-full font-mono text-sm ${formErrors.phoneNumber ? 'border-apple-red' : ''}`}
                />
                {formErrors.phoneNumber && (
                  <p className="text-xs text-apple-red mt-1">{formErrors.phoneNumber}</p>
                )}
              </div>

              {/* 2. Phone Number ID */}
              <div>
                <label className="block text-xs font-bold text-ios-dark mb-1">
                  2. Phone Number ID <span className="text-apple-red">*</span> <span className="text-[11px] font-normal text-ios-muted">(Found on Meta API Setup)</span>
                </label>
                <input
                  type="text"
                  value={addForm.metaPhoneId}
                  onChange={(e) => setAddForm({ ...addForm, metaPhoneId: e.target.value })}
                  placeholder="e.g. 1183576551512466"
                  className="input-apple w-full font-mono text-sm border-wa-green/50 focus:border-wa-green"
                />
                <p className="text-[11px] text-ios-muted mt-1">
                  Copy 16-digit ID from Meta Console: <code>Phone Number ID: 1183576551512466</code>
                </p>
              </div>

              {/* 3. WhatsApp Business Account ID */}
              <div>
                <label className="block text-xs font-bold text-ios-dark mb-1">
                  3. WhatsApp Business Account ID <span className="text-[11px] font-normal text-ios-muted">(WABA ID)</span>
                </label>
                <input
                  type="text"
                  value={addForm.wabaId}
                  onChange={(e) => setAddForm({ ...addForm, wabaId: e.target.value })}
                  placeholder="e.g. 1029485569660598"
                  className="input-apple w-full font-mono text-sm"
                />
                <p className="text-[11px] text-ios-muted mt-1">
                  Copy 16-digit ID from Meta Console: <code>WhatsApp Business Account ID: 1029485569660598</code>
                </p>
              </div>

              {/* 4. Access Token */}
              <div>
                <label className="block text-xs font-bold text-ios-dark mb-1">
                  4. Access Token <span className="text-apple-red">*</span> <span className="text-[11px] font-normal text-ios-muted">(System User Token or Temporary Token)</span>
                </label>
                <textarea
                  rows={3}
                  value={addForm.accessToken}
                  onChange={(e) => setAddForm({ ...addForm, accessToken: e.target.value })}
                  placeholder="Paste access token starting with EAAV... or EAAG..."
                  className="input-apple w-full font-mono text-xs"
                />
              </div>

              {/* 5. Display Name */}
              <div>
                <label className="block text-xs font-bold text-ios-dark mb-1">
                  5. Display Name <span className="text-[11px] font-normal text-ios-muted">(max 30 chars)</span>
                </label>
                <input
                  type="text"
                  value={addForm.displayName}
                  onChange={(e) => setAddForm({ ...addForm, displayName: e.target.value })}
                  placeholder="e.g. Kriscel AUTO Support"
                  maxLength={30}
                  className="input-apple w-full text-sm"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-black/5">
                <button
                  onClick={handleAddPhone}
                  disabled={!addForm.phoneNumber || !addForm.metaPhoneId || addPhoneMutation.isPending}
                  className="flex-1 py-3 bg-wa-green text-white rounded-apple-lg font-bold hover:bg-wa-green/90 transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {addPhoneMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save & Connect Meta Line
                </button>
                <button onClick={() => { setShowAddModal(false); setFormErrors({}); }} className="px-4 py-3 btn-apple btn-apple-outline rounded-apple-lg text-sm font-semibold">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-ios-dark">Bulk Import Phone Numbers</h3>
              <button onClick={() => setShowBulkImport(false)} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">
                  Phone Numbers <span className="text-xs text-ios-muted">(one per line, format: +1234567890,Display Name)</span>
                </label>
                <textarea
                  value={bulkImportText}
                  onChange={(e) => setBulkImportText(e.target.value)}
                  placeholder={"+1234567890,Support Team\n+9876543210,Sales Team"}
                  rows={10}
                  className="input-apple w-full font-mono text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => bulkImportMutation.mutate(bulkImportText)}
                  disabled={!bulkImportText.trim() || bulkImportMutation.isPending}
                  className="flex-1 py-3 btn-apple btn-wa-green rounded-apple-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {bulkImportMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Import Numbers
                </button>
                <button onClick={() => setShowBulkImport(false)} className="flex-1 py-3 btn-apple btn-apple-outline rounded-apple-lg">
                  Cancel
                </button>
              </div>

              {bulkImportMutation.isSuccess && (
                <div className="p-4 bg-apple-green/10 rounded-apple-lg">
                  <p className="text-sm text-apple-green">{bulkImportMutation.data?.data?.message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phone Detail Modal */}
      {showPhoneDetail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-ios-dark">Phone Details</h3>
              <button onClick={() => setShowPhoneDetail(null)} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Basic Info */}
              <div className="flex items-center gap-4 p-4 bg-ios-gray rounded-apple-lg">
                <div className="w-16 h-16 bg-wa-green/20 rounded-apple-xl flex items-center justify-center">
                  <Phone className="w-8 h-8 text-wa-green" />
                </div>
                <div>
                  <p className="text-xl font-bold text-ios-dark">{showPhoneDetail.phoneNumber}</p>
                  <p className="text-ios-muted">{showPhoneDetail.displayName || 'No display name'}</p>
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-4">
                <h4 className="font-medium text-ios-dark">Settings</h4>

                <div>
                  <label className="block text-sm text-ios-secondary mb-1 font-semibold">Display Name</label>
                  <input
                    type="text"
                    defaultValue={showPhoneDetail.displayName || ''}
                    onBlur={(e) => updatePhoneMutation.mutate({ id: showPhoneDetail.id, data: { displayName: e.target.value } })}
                    maxLength={30}
                    className="input-apple w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm text-ios-secondary mb-1 font-semibold">
                    Meta Phone Number ID <span className="text-xs font-normal text-ios-muted">(From Meta API Setup)</span>
                  </label>
                  <input
                    type="text"
                    defaultValue={showPhoneDetail.metaPhoneId || ''}
                    onBlur={(e) => updatePhoneMutation.mutate({ id: showPhoneDetail.id, data: { metaPhoneId: e.target.value } })}
                    placeholder="e.g. 153029851902025 or 1183576551512466"
                    className="input-apple w-full font-mono text-sm border-wa-green/40 focus:border-wa-green"
                  />
                  <p className="text-[11px] text-ios-muted mt-1">
                    Enter the 16-digit ID corresponding to this line in your Meta Developer Console.
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-ios-secondary mb-1 font-semibold">
                    Dedicated Access Token <span className="text-xs font-normal text-ios-muted">(Optional — Overrides Tenant Default Token)</span>
                  </label>
                  <input
                    type="password"
                    defaultValue={showPhoneDetail.accessToken || ''}
                    onBlur={(e) => updatePhoneMutation.mutate({ id: showPhoneDetail.id, data: { accessToken: e.target.value } })}
                    placeholder="Enter dedicated line token starting with EAAV..."
                    className="input-apple w-full font-mono text-xs border-slate-300 focus:border-wa-green"
                  />
                  <p className="text-[11px] text-ios-muted mt-1">
                    If this specific line has a separate access token, enter it here.
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-ios-secondary mb-1">Timezone</label>
                  <select
                    defaultValue={showPhoneDetail.timezone || 'UTC'}
                    onChange={(e) => updatePhoneMutation.mutate({ id: showPhoneDetail.id, data: { timezone: e.target.value } })}
                    className="input-apple w-full"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-ios-secondary mb-1">Daily Limit</label>
                  <input
                    type="number"
                    defaultValue={showPhoneDetail.dailySentLimit}
                    onBlur={(e) => updatePhoneMutation.mutate({ id: showPhoneDetail.id, data: { dailySentLimit: parseInt(e.target.value) } })}
                    min={100}
                    max={10000}
                    step={100}
                    className="input-apple w-full"
                  />
                </div>
              </div>

              {/* Business Hours */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-ios-dark">Business Hours</h4>
                  <button
                    onClick={() => updatePhoneMutation.mutate({
                      id: showPhoneDetail.id,
                      data: { businessHours: { enabled: !showPhoneDetail.businessHours?.enabled } }
                    })}
                    className={`px-3 py-1 text-sm rounded-apple-lg ${showPhoneDetail.businessHours?.enabled ? 'bg-apple-green/20 text-apple-green' : 'bg-ios-gray text-ios-muted'}`}
                  >
                    {showPhoneDetail.businessHours?.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                {DAYS.map(day => (
                  <div key={day} className="flex items-center gap-2">
                    <span className="w-24 text-sm text-ios-secondary capitalize">{day}</span>
                    <input
                      type="time"
                      defaultValue={(showPhoneDetail.businessHours as any)?.[day]?.start || '09:00'}
                      onChange={(e) => {
                        const hours = showPhoneDetail.businessHours || { enabled: true };
                        (hours as any)[day] = { start: e.target.value, end: (hours as any)[day]?.end || '17:00' };
                        updatePhoneMutation.mutate({ id: showPhoneDetail.id, data: { businessHours: hours } });
                      }}
                      className="input-apple w-32"
                    />
                    <span className="text-ios-muted">to</span>
                    <input
                      type="time"
                      defaultValue={(showPhoneDetail.businessHours as any)?.[day]?.end || '17:00'}
                      onChange={(e) => {
                        const hours = showPhoneDetail.businessHours || { enabled: true };
                        (hours as any)[day] = { start: (hours as any)[day]?.start || '09:00', end: e.target.value };
                        updatePhoneMutation.mutate({ id: showPhoneDetail.id, data: { businessHours: hours } });
                      }}
                      className="input-apple w-32"
                    />
                  </div>
                ))}
              </div>

              {/* Message Permissions */}
              <div className="space-y-3">
                <h4 className="font-medium text-ios-dark">Message Permissions</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => updatePhoneMutation.mutate({ id: showPhoneDetail.id, data: { canSendMarketing: !showPhoneDetail.canSendMarketing } })}
                    className={`flex-1 py-2.5 rounded-apple-lg text-sm font-medium transition ${
                      showPhoneDetail.canSendMarketing ? 'bg-apple-purple/20 text-apple-purple border border-apple-purple/30' : 'bg-ios-gray text-ios-muted'
                    }`}
                  >
                    Marketing {showPhoneDetail.canSendMarketing && '✓'}
                  </button>
                  <button
                    onClick={() => updatePhoneMutation.mutate({ id: showPhoneDetail.id, data: { canSendUtility: !showPhoneDetail.canSendUtility } })}
                    className={`flex-1 py-2.5 rounded-apple-lg text-sm font-medium transition ${
                      showPhoneDetail.canSendUtility ? 'bg-apple-green/20 text-apple-green border border-apple-green/30' : 'bg-ios-gray text-ios-muted'
                    }`}
                  >
                    Utility {showPhoneDetail.canSendUtility && '✓'}
                  </button>
                  <button
                    onClick={() => updatePhoneMutation.mutate({ id: showPhoneDetail.id, data: { canSendAuth: !showPhoneDetail.canSendAuth } })}
                    className={`flex-1 py-2.5 rounded-apple-lg text-sm font-medium transition ${
                      showPhoneDetail.canSendAuth ? 'bg-apple-blue/20 text-apple-blue border border-apple-blue/30' : 'bg-ios-gray text-ios-muted'
                    }`}
                  >
                    Auth {showPhoneDetail.canSendAuth && '✓'}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-black/5">
                <button
                  onClick={() => refreshQualityMutation.mutate(showPhoneDetail.id)}
                  disabled={refreshQualityMutation.isPending}
                  className="flex-1 py-2.5 btn-apple btn-apple-outline rounded-apple-lg flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshQualityMutation.isPending ? 'animate-spin' : ''}`} />
                  Refresh Quality
                </button>
                <button
                  onClick={() => { if (confirm('Delete this phone number?')) deletePhoneMutation.mutate(showPhoneDetail.id); }}
                  className="py-2.5 px-4 border border-apple-red/30 text-apple-red rounded-apple-lg hover:bg-apple-red/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Step-by-Step WhatsApp Onboarding Wizard Modal */}
      <WhatsAppSetupWizardModal
        isOpen={showWizardModal}
        onClose={() => setShowWizardModal(false)}
        onSuccess={() => refetch()}
        initialCredentials={credentials}
        initialPhone={phones[0]}
      />
    </div>
  );
}
