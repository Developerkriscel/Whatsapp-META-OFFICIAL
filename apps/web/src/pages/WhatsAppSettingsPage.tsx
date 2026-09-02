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
  Upload, FileText, Send, Bell, BellOff, Sparkles, Facebook, CreditCard, Lock, Unlock
} from 'lucide-react';
import WhatsAppSetupWizardModal from '../components/WhatsAppSetupWizardModal';
import { loadFacebookSdk, launchEmbeddedSignup } from '../utils/embeddedSignup';

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
    // Share of our sends that failed. Previously labelled "blockRate", which
    // Meta does not expose and this never measured.
    failureRate: number;
    failedCount: number;
  };
  dailyTrend: { date: string; deliveryRate: number; openRate: number; responseRate: number }[];
  issues: string[];
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
  phones: {
    id: string; phoneNumber: string; dailySentLimit: number; todaySentCount: number; resetAt: string;
    messagingLimitTier: string | null; messagingLimit: number | null;
  }[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  pending_verification: { label: 'Pending Verification', color: 'text-apple-orange', bgColor: 'bg-apple-orange/20', icon: Clock },
  verified: { label: 'Verified', color: 'text-apple-green', bgColor: 'bg-apple-green/20', icon: CheckCircle },
  suspended: { label: 'Suspended', color: 'text-apple-red', bgColor: 'bg-apple-red/20', icon: AlertCircle },
  limited: { label: 'Limited', color: 'text-apple-orange', bgColor: 'bg-apple-orange/20', icon: AlertTriangle },
  disconnected: { label: 'Disconnected', color: 'text-ios-muted', bgColor: 'bg-ios-gray', icon: AlertCircle },
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
  const [activeTab, setActiveTab] = useState<'phones' | 'verification' | 'webhook' | 'credentials' | 'quality' | 'rate-limits' | 'billing'>('phones');
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPhoneDetail, setShowPhoneDetail] = useState<PhoneNumber | null>(null);
  const [confirmDeletePhone, setConfirmDeletePhone] = useState<PhoneNumber | null>(null);
  const [deletePhoneError, setDeletePhoneError] = useState<string | null>(null);
  const [deleteBlockedByConversations, setDeleteBlockedByConversations] = useState(false);
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
  const [oauthWabas, setOauthWabas] = useState<{ id: string; name: string }[] | null>(null);
  const [oauthPhones, setOauthPhones] = useState<{ id: string; display_phone_number: string; verified_name: string }[] | null>(null);
  const [oauthSelectedWaba, setOauthSelectedWaba] = useState<{ id: string; name: string } | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthConnectedMessage, setOauthConnectedMessage] = useState<string | null>(null);
  const [registerPin, setRegisterPin] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Parse Meta OAuth redirect params on mount (?oauth=success&wabas=... or ?error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('oauth');
    const errorParam = params.get('error');

    if (oauthStatus === 'success') {
      const wabasParam = params.get('wabas');
      if (wabasParam) {
        try {
          const parsed = JSON.parse(decodeURIComponent(wabasParam));
          setOauthWabas(Array.isArray(parsed) ? parsed : parsed?.data || []);
          setActiveTab('phones');
        } catch {
          setOauthError('Failed to parse WhatsApp Business Accounts from Meta.');
        }
      }
      window.history.replaceState({}, '', window.location.pathname);
    } else if (errorParam) {
      setOauthError(decodeURIComponent(errorParam));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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

  // WABA billing info (tenant's own WABA name + ID for Meta deep-link)
  const wabaInfoQuery = useQuery({
    queryKey: ['whatsapp-waba-info'],
    queryFn: async () => {
      const res = await api.get('/whatsapp/waba/billing-status');
      return res.data;
    },
    enabled: activeTab === 'billing',
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
      setConfirmDeletePhone(null);
      setDeletePhoneError(null);
      setDeleteBlockedByConversations(false);
    },
    onError: (err: any) => {
      setDeletePhoneError(err.response?.data?.error?.message || 'Failed to delete phone number');
      setDeleteBlockedByConversations(err.response?.data?.error?.code === 'PHONE_HAS_CONVERSATIONS');
    },
  });

  const disconnectPhoneMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/whatsapp/phone-numbers/${id}/disconnect`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      setShowPhoneDetail(null);
      setConfirmDeletePhone(null);
      setDeletePhoneError(null);
      setDeleteBlockedByConversations(false);
    },
    onError: (err: any) => {
      setDeletePhoneError(err.response?.data?.error?.message || 'Failed to disconnect phone number');
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

  const registerPhoneMutation = useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string }) => {
      const response = await api.post(`/whatsapp/phone-numbers/${id}/register`, { pin });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      setRegisterSuccess(data?.data?.message || 'Phone registered successfully');
      setRegisterError(null);
      setRegisterPin('');
    },
    onError: (err: any) => {
      setRegisterError(err.response?.data?.error?.message || 'Registration failed');
      setRegisterSuccess(null);
    },
  });

  const deregisterPhoneMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/whatsapp/phone-numbers/${id}/deregister`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      setRegisterSuccess('Phone deregistered from Meta Cloud API');
      setRegisterError(null);
    },
    onError: (err: any) => {
      setRegisterError(err.response?.data?.error?.message || 'Deregistration failed');
      setRegisterSuccess(null);
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

  const connectFacebookMutation = useMutation({
    mutationFn: async () => {
      // Prefer the real Embedded Signup popup (Meta's required flow for Tech Providers).
      // Falls back to the classic OAuth redirect until a Signup Configuration exists.
      const configRes = await api.get('/whatsapp/embedded-signup/config').catch(() => null);
      const config = configRes?.data?.data;

      if (config?.appId && config?.configId) {
        await loadFacebookSdk(config.appId, config.graphApiVersion);
        try {
          const result = await launchEmbeddedSignup(config.configId);
          const completeRes = await api.post('/whatsapp/embedded-signup/complete', result);
          return { embedded: true as const, data: completeRes.data };
        } catch (err: any) {
          // Facebook refuses the popup for accounts without a role on the app
          // until business_management has Advanced Access, showing "Feature
          // unavailable". Meta's hosted page runs the same flow on their side
          // and works for anyone, so offer that rather than dead-ending.
          if (config.hostedSignupUrl && /unavailable|not available|feature/i.test(err?.message || '')) {
            return { hosted: true as const, url: config.hostedSignupUrl };
          }
          throw err;
        }
      }

      const response = await api.get('/whatsapp/oauth/url');
      return { embedded: false as const, data: response.data };
    },
    onSuccess: (result: any) => {
      if (result.hosted) {
        // Meta's hosted onboarding runs in its own tab; the customer returns here
        // and their account appears once Meta shares it with the app.
        window.open(result.url, '_blank', 'noopener');
        setOauthError(null);
        return;
      }
      if (result.embedded) {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
        setOauthError(null);
      } else {
        const authUrl = result.data?.data?.authUrl;
        if (authUrl) window.location.href = authUrl;
      }
    },
    onError: (err: any) => {
      setOauthError(err.response?.data?.error?.message || err.message || 'Failed to connect WhatsApp');
    },
  });

  const selectWabaMutation = useMutation({
    mutationFn: async (waba: { id: string; name: string }) => {
      const response = await api.post('/whatsapp/oauth/select-waba', { wabaId: waba.id, wabaName: waba.name });
      return response.data;
    },
    onSuccess: (data, waba) => {
      setOauthSelectedWaba(waba);
      setOauthPhones(data?.data?.phoneNumbers || []);
    },
    onError: (err: any) => {
      setOauthError(err.response?.data?.error?.message || 'Failed to load phone numbers for this WABA');
    },
  });

  const connectPhoneOAuthMutation = useMutation({
    mutationFn: async (phone: { id: string; verified_name: string }) => {
      const response = await api.post('/whatsapp/oauth/connect-phone', {
        phoneNumberId: phone.id,
        displayName: phone.verified_name,
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-settings'] });
      setOauthConnectedMessage(data?.message || 'Phone number connected successfully!');
      setOauthWabas(null);
      setOauthPhones(null);
      setOauthSelectedWaba(null);
    },
    onError: (err: any) => {
      setOauthError(err.response?.data?.error?.message || 'Failed to connect phone number');
    },
  });

  const phones: PhoneNumber[] = data?.phones?.data || [];
  const webhookUrl = data?.webhook?.data?.webhookUrl || '';
  const credentials = data?.credentials?.data || {};
  const verification: BusinessVerification = data?.verification?.data || { steps: [] };
  const rateLimits: RateLimits = data?.rateLimits?.data || { phones: [] };
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
        // The backend writes appId/wabaId directly with no "keep existing if
        // blank" fallback (unlike secret/token, which do have that safety
        // net) — sending a placeholder ID here would silently overwrite the
        // tenant's real credentials with someone else's. Require the real
        // values instead of guessing.
        if (!credentials?.appId) {
          setFormErrors({ phoneNumber: 'Set your Meta App ID first, under the API Credentials tab.' });
          return;
        }
        if (!addForm.wabaId) {
          setFormErrors({ phoneNumber: 'WhatsApp Business Account ID is required when providing an access token.' });
          return;
        }
        await api.post('/whatsapp/credentials', {
          appId: credentials.appId,
          wabaId: addForm.wabaId,
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
            onClick={() => refetch()}
            disabled={isLoading}
            className="btn-apple btn-apple-outline flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Primary onboarding path: Connect with Facebook */}
      <div
        className="p-5 text-white rounded-apple-2xl shadow-lg flex flex-col md:flex-row items-center justify-between gap-4"
        style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 55%, #25D366 100%)' }}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-apple-xl bg-white/15 text-white flex items-center justify-center font-bold text-xl border border-white/25 shrink-0">
            <Facebook className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Connect WhatsApp
            </h3>
            <p className="text-xs text-white/80 mt-0.5">
              One click via Meta — authorize, pick your WhatsApp Business Account and phone number, done. No App ID or tokens to copy.
            </p>
          </div>
        </div>
        <button
          onClick={() => connectFacebookMutation.mutate()}
          disabled={connectFacebookMutation.isPending}
          className="px-5 py-2.5 bg-white text-wa-dark font-semibold text-sm rounded-apple-xl hover:bg-white/90 transition shadow-md shrink-0 flex items-center gap-2 disabled:opacity-50"
        >
          {connectFacebookMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Facebook className="w-4 h-4" />}
          Connect with Facebook
        </button>
      </div>

      {/* Advanced / manual path — for tenants with an existing Meta setup */}
      <button
        onClick={() => setShowWizardModal(true)}
        className="w-full text-left px-4 py-2.5 rounded-apple-lg border border-dashed border-ios-gray text-ios-secondary hover:border-wa-green hover:text-wa-green transition flex items-center gap-2 text-sm"
      >
        <Sparkles className="w-4 h-4 shrink-0" />
        <span>
          <span className="font-medium">Advanced / Manual Setup</span> — already have a Meta App ID, WABA ID, and permanent token? Enter them directly.
        </span>
      </button>

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
            { id: 'billing', label: 'Line of Credit', icon: CreditCard },
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
                            onClick={() => { setConfirmDeletePhone(phone); setDeletePhoneError(null); setDeleteBlockedByConversations(false); }}
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
                <Sparkles className="w-3.5 h-3.5 text-wa-green" /> Edit Credentials
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
                  qualityReport.qualityScore === 'RED' ? 'bg-apple-red/20 text-apple-red' :
                  'bg-ios-gray text-ios-muted'
                }`}>
                  <div className={`w-3 h-3 rounded-full ${
                    qualityReport.qualityScore === 'GREEN' ? 'bg-apple-green' :
                    qualityReport.qualityScore === 'YELLOW' ? 'bg-apple-orange' :
                    qualityReport.qualityScore === 'RED' ? 'bg-apple-red' :
                    'bg-ios-muted'
                  }`} />
                  <span className="font-semibold">
                    {qualityReport.qualityScore === 'GREEN' ? 'High' :
                     qualityReport.qualityScore === 'YELLOW' ? 'Medium' :
                     qualityReport.qualityScore === 'RED' ? 'Low' :
                     'Not yet available'}
                  </span>
                  <span className="text-sm opacity-70">({qualityReport.period})</span>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-4 gap-4">
                <div className="card-apple p-4 text-center">
                  <p className="text-3xl font-bold text-apple-green">{qualityReport.metrics.deliveryRate}%</p>
                  <p className="text-sm text-ios-muted">Delivery Rate</p>
                  <p className="text-xs text-ios-muted mt-1">Accepted or delivered by Meta</p>
                </div>
                <div className="card-apple p-4 text-center">
                  <p className="text-3xl font-bold text-apple-green">{qualityReport.metrics.openRate}%</p>
                  <p className="text-sm text-ios-muted">Open Rate</p>
                  <p className="text-xs text-ios-muted mt-1">Messages marked read</p>
                </div>
                <div className="card-apple p-4 text-center">
                  <p className="text-3xl font-bold text-apple-orange">{qualityReport.metrics.responseRate}%</p>
                  <p className="text-sm text-ios-muted">Response Rate</p>
                  <p className="text-xs text-ios-muted mt-1">Replied to within 24h</p>
                </div>
                <div className="card-apple p-4 text-center">
                  <p className="text-3xl font-bold text-apple-red">{qualityReport.metrics.failureRate}%</p>
                  <p className="text-sm text-ios-muted">Failure Rate</p>
                  <p className="text-xs text-ios-muted mt-1">
                    {qualityReport.metrics.failedCount} message{qualityReport.metrics.failedCount === 1 ? '' : 's'} rejected
                  </p>
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
          {/* Per-Phone Limits — Meta doesn't publish a per-minute/hour figure
              at all (that used to be a fabricated "Global Rate Limits" block
              showing the same numbers for every tenant); the real constraint
              is a per-phone messaging_limit_tier capping unique customers
              messaged per rolling 24h, fetched live below. */}
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-1">Messaging Limits</h2>
            <p className="text-sm text-ios-muted mb-4">Meta's real per-phone limit — a cap on unique customers messaged per rolling 24 hours.</p>
            <div className="space-y-3">
              {rateLimits.phones.length === 0 ? (
                <p className="text-sm text-ios-muted">No connected phone numbers.</p>
              ) : (
                rateLimits.phones.map(phone => {
                  const usage = getUsagePercentage(phone.todaySentCount, phone.dailySentLimit);
                  return (
                    <div key={phone.id} className="p-4 bg-ios-gray/50 rounded-apple-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-ios-dark">{phone.phoneNumber}</p>
                        {phone.messagingLimitTier ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-wa-green/15 text-wa-green">
                            {phone.messagingLimitTier.replace('_', ' ')}
                            {phone.messagingLimit != null ? ` — ${phone.messagingLimit.toLocaleString()}/day` : ' — Unlimited'}
                          </span>
                        ) : (
                          <span className="text-xs text-ios-muted">Tier not available</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm text-ios-muted mb-1">
                        <span>Sent today (this app)</span>
                        <span>{phone.todaySentCount.toLocaleString()} / {phone.dailySentLimit.toLocaleString()}</span>
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
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Meta Payment Setup Tab */}
      {activeTab === 'billing' && (() => {
        const waba = wabaInfoQuery.data?.data;
        const wabaId = waba?.wabaId;
        const wabaName = waba?.wabaName;
        const currency = waba?.currency;
        const notConnected = waba && !waba.configured;
        const billingHubUrl = 'https://business.facebook.com/billing_hub/accounts/';
        const waManagerUrl = wabaId
          ? `https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${wabaId}`
          : 'https://business.facebook.com/wa/manage/';

        return (
          <div className="space-y-6">
            {/* Header */}
            <div className="card-apple p-6 border-l-4 border-[#1877F2]">
              <h2 className="text-lg font-semibold text-ios-dark mb-2 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#1877F2]" /> Set Up Payment in Meta
              </h2>
              <p className="text-sm text-ios-secondary">
                WhatsApp conversation charges are billed <strong>directly by Meta</strong> to your business account.
                You need to add a payment method in your Meta Business Manager so you can start sending messages independently.
              </p>
            </div>

            {/* WABA Info — show which account they need to set up */}
            {notConnected ? (
              <div className="card-apple p-5 flex items-start gap-3 border-l-4 border-apple-orange">
                <AlertTriangle className="w-5 h-5 text-apple-orange shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-apple-orange">WhatsApp Not Connected</p>
                  <p className="text-sm text-ios-secondary mt-1">
                    Connect your WhatsApp Business Account first (Phone Numbers tab), then come back here to set up payment.
                  </p>
                </div>
              </div>
            ) : wabaInfoQuery.isLoading ? (
              <div className="card-apple p-6 flex items-center gap-3 text-ios-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading your account info...</span>
              </div>
            ) : wabaId ? (
              <div className="card-apple p-5">
                <p className="text-xs font-semibold text-ios-muted uppercase tracking-wide mb-3">Your WhatsApp Business Account</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-wa-green/10 rounded-apple-xl flex items-center justify-center shrink-0">
                    <MessageSquare className="w-6 h-6 text-wa-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ios-dark">{wabaName || 'WhatsApp Business Account'}</p>
                    <p className="text-xs text-ios-muted font-mono mt-0.5">ID: {wabaId}</p>
                    {currency && <p className="text-xs text-ios-muted mt-0.5">Billing currency: {currency}</p>}
                  </div>
                  <CheckCircle className="w-5 h-5 text-wa-green shrink-0" />
                </div>
                <p className="text-xs text-ios-muted mt-3 p-3 bg-ios-gray/50 rounded-apple-lg">
                  When you open Meta Billing Hub below, log in with the <strong>Facebook account that owns this WABA</strong>. You will see this account in the "WhatsApp Business accounts" tab.
                </p>
              </div>
            ) : null}

            {/* Step-by-step guide */}
            <div className="card-apple p-6">
              <h3 className="font-semibold text-ios-dark mb-4">How to Add a Payment Method in Meta</h3>
              <div className="space-y-4">
                {[
                  {
                    step: '1',
                    title: 'Open Meta Billing Hub',
                    desc: 'Click the button below. Log in with the Facebook account that manages your WhatsApp Business Account.',
                    color: 'bg-[#1877F2]/10 text-[#1877F2]',
                  },
                  {
                    step: '2',
                    title: 'Go to "WhatsApp Business accounts" tab',
                    desc: 'Inside Billing Hub, click the "WhatsApp Business accounts" tab at the top. Find your WABA in the list.',
                    color: 'bg-wa-green/10 text-wa-green',
                  },
                  {
                    step: '3',
                    title: 'Add a payment method',
                    desc: 'Click "Add payment method" on your WABA. Choose a credit/debit card or request a Line of Credit (monthly invoice, for higher-volume businesses).',
                    color: 'bg-apple-purple/10 text-apple-purple',
                  },
                  {
                    step: '4',
                    title: 'Start sending messages',
                    desc: 'Once your payment method is active, Meta bills you directly each month based on conversations. You are fully independent.',
                    color: 'bg-apple-green/10 text-apple-green',
                  },
                ].map(({ step, title, desc, color }) => (
                  <div key={step} className="flex items-start gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${color}`}>
                      {step}
                    </div>
                    <div>
                      <p className="font-semibold text-ios-dark text-sm">{title}</p>
                      <p className="text-sm text-ios-secondary mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 mt-6">
                <a
                  href={billingHubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] text-white text-sm font-semibold rounded-apple-lg hover:bg-[#1464D6] transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Meta Billing Hub
                </a>
                <a
                  href={waManagerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-black/10 text-ios-dark text-sm font-semibold rounded-apple-lg hover:bg-ios-gray/50 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  WhatsApp Manager
                </a>
              </div>
            </div>

            {/* Pricing info */}
            <div className="card-apple p-6">
              <h3 className="font-semibold text-ios-dark mb-1">Meta Conversation Pricing</h3>
              <p className="text-sm text-ios-secondary mb-4">
                Meta charges per conversation (24-hour window), not per message. Rates depend on conversation type and recipient country.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Marketing', desc: 'Business-initiated promotions', color: 'text-apple-purple bg-apple-purple/10' },
                  { label: 'Utility', desc: 'Transactional updates & alerts', color: 'text-apple-blue bg-apple-blue/10' },
                  { label: 'Authentication', desc: 'OTPs and verification codes', color: 'text-apple-green bg-apple-green/10' },
                  { label: 'Service', desc: 'Customer-initiated conversations', color: 'text-apple-orange bg-apple-orange/10' },
                ].map(cat => (
                  <div key={cat.label} className={`p-3 rounded-apple-lg ${cat.color.split(' ')[1]}`}>
                    <p className={`text-xs font-bold ${cat.color.split(' ')[0]}`}>{cat.label}</p>
                    <p className="text-xs text-ios-secondary mt-0.5">{cat.desc}</p>
                  </div>
                ))}
              </div>
              <a
                href="https://developers.facebook.com/docs/whatsapp/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm text-[#1877F2] hover:underline"
              >
                View full pricing table <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        );
      })()}

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

              {/* Cloud API Registration */}
              <div className="space-y-3 pt-2">
                <h4 className="font-medium text-ios-dark flex items-center gap-2">
                  <Shield className="w-4 h-4 text-wa-green" /> Cloud API Registration
                </h4>
                <p className="text-xs text-ios-secondary">
                  Register this phone number with Meta's Cloud API. Required for migrating from On-Premises API or when setting up a new number with a PIN.
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={registerPin}
                    onChange={(e) => setRegisterPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit PIN"
                    maxLength={6}
                    className="input-apple w-36 font-mono text-center text-lg tracking-widest"
                  />
                  <button
                    onClick={() => {
                      setRegisterError(null);
                      setRegisterSuccess(null);
                      registerPhoneMutation.mutate({ id: showPhoneDetail.id, pin: registerPin });
                    }}
                    disabled={registerPin.length !== 6 || registerPhoneMutation.isPending}
                    className="flex-1 py-2.5 btn-apple btn-apple-blue rounded-apple-lg flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {registerPhoneMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    Register
                  </button>
                  <button
                    onClick={() => {
                      setRegisterError(null);
                      setRegisterSuccess(null);
                      deregisterPhoneMutation.mutate(showPhoneDetail.id);
                    }}
                    disabled={deregisterPhoneMutation.isPending}
                    className="py-2.5 px-4 border border-apple-orange/40 text-apple-orange rounded-apple-lg hover:bg-apple-orange/10 flex items-center gap-1.5 text-sm disabled:opacity-50"
                  >
                    {deregisterPhoneMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                    Deregister
                  </button>
                </div>
                {registerError && (
                  <div className="flex items-center gap-2 p-3 bg-apple-red/10 rounded-apple-lg text-sm text-apple-red">
                    <AlertCircle className="w-4 h-4 shrink-0" />{registerError}
                  </div>
                )}
                {registerSuccess && (
                  <div className="flex items-center gap-2 p-3 bg-apple-green/10 rounded-apple-lg text-sm text-apple-green">
                    <CheckCircle className="w-4 h-4 shrink-0" />{registerSuccess}
                  </div>
                )}
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
                  onClick={() => { setConfirmDeletePhone(showPhoneDetail); setDeletePhoneError(null); setDeleteBlockedByConversations(false); }}
                  className="py-2.5 px-4 border border-apple-red/30 text-apple-red rounded-apple-lg hover:bg-apple-red/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Phone Confirm Modal */}
      {confirmDeletePhone && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-apple-red/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-apple-red" />
              </div>
              <h3 className="text-lg font-semibold text-ios-dark">Delete phone number?</h3>
            </div>
            <p className="text-sm text-ios-secondary mb-3">
              {confirmDeletePhone.displayName || confirmDeletePhone.phoneNumber} will be permanently removed. This action cannot be undone.
            </p>
            {deletePhoneError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-apple-lg text-sm text-apple-red mb-3">
                {deletePhoneError}
              </div>
            )}
            {deleteBlockedByConversations ? (
              <div className="space-y-2">
                <p className="text-xs text-ios-muted">
                  It has existing chat history, so deleting it outright isn't possible without losing that. You can disconnect it instead — this keeps the number and its conversation history, just removes the live Meta connection so it stops sending/receiving.
                </p>
                <button
                  onClick={() => disconnectPhoneMutation.mutate(confirmDeletePhone.id)}
                  disabled={disconnectPhoneMutation.isPending}
                  className="w-full btn-apple bg-apple-orange text-white hover:bg-apple-orange/90 disabled:opacity-50"
                >
                  {disconnectPhoneMutation.isPending ? 'Disconnecting...' : 'Disconnect from app instead'}
                </button>
                <button onClick={() => { setConfirmDeletePhone(null); setDeletePhoneError(null); setDeleteBlockedByConversations(false); }} className="w-full btn-apple btn-apple-outline">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => deletePhoneMutation.mutate(confirmDeletePhone.id)}
                  disabled={deletePhoneMutation.isPending}
                  className="flex-1 btn-apple bg-apple-red text-white hover:bg-apple-red/90 disabled:opacity-50"
                >
                  {deletePhoneMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
                <button onClick={() => { setConfirmDeletePhone(null); setDeletePhoneError(null); }} className="flex-1 btn-apple btn-apple-outline">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OAuth error toast */}
      {oauthError && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm p-4 bg-apple-red/10 border border-apple-red/30 rounded-apple-lg shadow-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-apple-red">Facebook connection failed</p>
            <p className="text-xs text-ios-secondary mt-1">{oauthError}</p>
          </div>
          <button onClick={() => setOauthError(null)} className="p-1 hover:bg-black/5 rounded-apple-lg">
            <X className="w-4 h-4 text-ios-muted" />
          </button>
        </div>
      )}

      {/* OAuth success toast */}
      {oauthConnectedMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm p-4 bg-apple-green/10 border border-apple-green/30 rounded-apple-lg shadow-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-apple-green shrink-0 mt-0.5" />
          <p className="text-sm text-apple-green flex-1">{oauthConnectedMessage}</p>
          <button onClick={() => setOauthConnectedMessage(null)} className="p-1 hover:bg-black/5 rounded-apple-lg">
            <X className="w-4 h-4 text-ios-muted" />
          </button>
        </div>
      )}

      {/* OAuth: WABA Selection Modal */}
      {oauthWabas && !oauthSelectedWaba && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4 border-b border-black/5 pb-3">
              <div>
                <h3 className="text-lg font-bold text-ios-dark flex items-center gap-2">
                  <Facebook className="w-5 h-5 text-[#1877F2]" /> Choose a WhatsApp Business Account
                </h3>
                <p className="text-xs text-ios-muted">Signed in via Facebook. Select which WABA to connect.</p>
              </div>
              <button onClick={() => { setOauthWabas(null); setOauthSelectedWaba(null); }} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            {oauthWabas.length === 0 ? (
              <div className="p-8 text-center">
                <AlertTriangle className="w-10 h-10 text-apple-orange mx-auto mb-3" />
                <p className="text-sm text-ios-secondary">No WhatsApp Business Accounts found on this Facebook account.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {oauthWabas.map((waba) => (
                  <button
                    key={waba.id}
                    onClick={() => selectWabaMutation.mutate(waba)}
                    disabled={selectWabaMutation.isPending}
                    className="w-full flex items-center justify-between p-4 bg-ios-gray/50 hover:bg-ios-gray rounded-apple-lg transition text-left disabled:opacity-50"
                  >
                    <div>
                      <p className="font-medium text-ios-dark">{waba.name}</p>
                      <p className="text-xs text-ios-muted font-mono">{waba.id}</p>
                    </div>
                    {selectWabaMutation.isPending && selectWabaMutation.variables?.id === waba.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-wa-green" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-ios-muted" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* OAuth: Phone Number Selection Modal */}
      {oauthSelectedWaba && oauthPhones && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4 border-b border-black/5 pb-3">
              <div>
                <h3 className="text-lg font-bold text-ios-dark flex items-center gap-2">
                  <Phone className="w-5 h-5 text-wa-green" /> Choose a Phone Number
                </h3>
                <p className="text-xs text-ios-muted">From {oauthSelectedWaba.name}</p>
              </div>
              <button
                onClick={() => { setOauthWabas(null); setOauthPhones(null); setOauthSelectedWaba(null); }}
                className="p-1 hover:bg-ios-gray rounded-apple-lg"
              >
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            {oauthPhones.length === 0 ? (
              <div className="p-8 text-center">
                <AlertTriangle className="w-10 h-10 text-apple-orange mx-auto mb-3" />
                <p className="text-sm text-ios-secondary">No phone numbers found on this WhatsApp Business Account.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {oauthPhones.map((phone) => (
                  <button
                    key={phone.id}
                    onClick={() => connectPhoneOAuthMutation.mutate(phone)}
                    disabled={connectPhoneOAuthMutation.isPending}
                    className="w-full flex items-center justify-between p-4 bg-ios-gray/50 hover:bg-ios-gray rounded-apple-lg transition text-left disabled:opacity-50"
                  >
                    <div>
                      <p className="font-medium text-ios-dark">{phone.display_phone_number}</p>
                      <p className="text-xs text-ios-muted">{phone.verified_name}</p>
                    </div>
                    {connectPhoneOAuthMutation.isPending && connectPhoneOAuthMutation.variables?.id === phone.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-wa-green" />
                    ) : (
                      <Plus className="w-4 h-4 text-wa-green" />
                    )}
                  </button>
                ))}
              </div>
            )}
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
