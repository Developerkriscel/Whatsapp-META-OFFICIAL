/**
 * Tenant Settings Page - Fully Functional with API Integration
 */

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Save, Building, Globe, Bell, Key, Shield, Eye, EyeOff, Check, Loader2, Copy, Plus, Trash2, X, QrCode, Camera } from 'lucide-react';

const TABS = [
  { id: 'profile', label: 'Profile', icon: Building },
  { id: 'business', label: 'Business', icon: Building },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'integrations', label: 'Integrations', icon: Globe },
  { id: 'api', label: 'API Keys', icon: Key },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
  'UTC',
];

const INDUSTRIES = ['Technology', 'Healthcare', 'Retail', 'Finance', 'Education', 'Other'];
const COMPANY_SIZES = ['1-10 employees', '11-50 employees', '50-200 employees', '201-1000 employees', '1000+ employees'];

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('profile');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false });

  // Profile form state
  // The Change Photo button had no handler at all, and User.avatarUrl was a
  // column nothing ever wrote.
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  const uploadAvatar = async (file: File) => {
    setAvatarError('');
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/uploads/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAvatarUrl(res.data?.data?.url ?? null);
    } catch (err: any) {
      setAvatarError(err?.response?.data?.error?.message || 'Could not upload that image.');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
    timezone: 'America/New_York',
  });

  // Business form state
  const [businessForm, setBusinessForm] = useState({
    companyName: '',
    website: '',
    address: '',
    industry: 'Technology',
    companySize: '50-200 employees',
  });

  // Notification form state
  const [notificationForm, setNotificationForm] = useState({
    emailNewMessages: true,
    emailDeliveryReports: true,
    emailWeeklyDigest: false,
    emailBillingAlerts: true,
    browserNotifications: true,
    smsAlerts: false,
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // 2FA state
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFactorData, setTwoFactorData] = useState<any>(null);
  const [verifyCode, setVerifyCode] = useState('');

  // API Keys state
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<{ name: string; key: string } | null>(null);

  // Fetch user profile
  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await api.get('/auth/me');
      return response.data.data;
    },
  });

  // Fetch tenant settings
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenantSettings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.data;
    },
  });

  // Fetch notification preferences
  const { data: notificationSettings } = useQuery({
    queryKey: ['notificationSettings'],
    queryFn: async () => {
      const response = await api.get('/auth/settings/notifications');
      return response.data.data;
    },
  });

  // Fetch API keys
  const { data: apiKeys, refetch: refetchApiKeys } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: async () => {
      const response = await api.get('/settings/api-keys');
      return response.data.data;
    },
  });

  // Fetch 2FA status
  const { data: twoFactorStatus } = useQuery({
    queryKey: ['twoFactorStatus'],
    queryFn: async () => {
      const response = await api.get('/auth/2fa/status');
      return response.data.data;
    },
  });

  // Update profile mutation
  const updateProfile = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.patch('/auth/me', data);
      return response.data;
    },
    onSuccess: (response) => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      // The header/sidebar name+email come from AuthContext (backed by
      // localStorage), a separate source from this page's own ['profile']
      // query — without this, the save "succeeds" but every other part of
      // the UI keeps showing the old name until the next full login.
      if (response?.data) {
        updateUser({ name: response.data.name, email: response.data.email });
      }
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || 'Failed to update profile');
      setTimeout(() => setError(null), 3000);
    },
  });

  // Update tenant settings mutation
  const updateTenantSettings = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.patch('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ['tenantSettings'] });
    },
  });

  // Update notifications mutation
  const updateNotifications = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.patch('/auth/settings/notifications', data);
      return response.data;
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ['notificationSettings'] });
    },
  });

  // Change password mutation
  const changePassword = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.patch('/auth/me', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      return response.data;
    },
    onSuccess: () => {
      setSaved(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || 'Failed to change password');
      setTimeout(() => setError(null), 3000);
    },
  });

  // 2FA setup mutation
  const setup2FA = useMutation({
    mutationFn: async () => {
      const response = await api.post('/auth/2fa/setup');
      return response.data;
    },
    onSuccess: (data) => {
      setTwoFactorData(data.data);
      setShow2FASetup(true);
    },
  });

  // Enable 2FA mutation
  const enable2FA = useMutation({
    mutationFn: async (code: string) => {
      const response = await api.post('/auth/2fa/enable', { code });
      return response.data;
    },
    onSuccess: () => {
      setShow2FASetup(false);
      setTwoFactorData(null);
      setVerifyCode('');
      queryClient.invalidateQueries({ queryKey: ['twoFactorStatus'] });
    },
  });

  // Disable 2FA mutation
  const disable2FA = useMutation({
    mutationFn: async (password: string) => {
      const response = await api.post('/auth/2fa/disable', { password });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['twoFactorStatus'] });
    },
  });

  // Create API key mutation
  const createApiKey = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post('/settings/api-key', { name });
      return response.data;
    },
    onSuccess: (data) => {
      setShowKeyModal(false);
      setNewKeyName('');
      setRevealedKey({ name: data.data.name, key: data.data.key });
      refetchApiKeys();
    },
  });

  // Delete API key mutation
  const deleteApiKey = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await api.delete(`/settings/api-keys/${keyId}`);
      return response.data;
    },
    onSuccess: () => {
      refetchApiKeys();
    },
  });

  // Populate forms with fetched data
  useEffect(() => {
    if (profileData) {
      setProfileForm({
        name: profileData.name || '',
        email: profileData.email || '',
        phone: profileData.phone || '',
        timezone: profileData.tenant?.timezone || 'America/New_York',
      });
      // Show the stored photo rather than the initial, when there is one.
      setAvatarUrl(profileData.avatarUrl ?? null);
    }
  }, [profileData]);

  useEffect(() => {
    if (tenantSettings) {
      setBusinessForm({
        companyName: tenantSettings.name || '',
        website: tenantSettings.website || '',
        address: '',
        industry: tenantSettings.industry || 'Technology',
        companySize: '50-200 employees',
      });
    }
  }, [tenantSettings]);

  useEffect(() => {
    if (notificationSettings) {
      setNotificationForm({
        emailNewMessages: notificationSettings.emailNewMessages ?? true,
        emailDeliveryReports: notificationSettings.emailDeliveryReports ?? true,
        emailWeeklyDigest: notificationSettings.emailWeeklyDigest ?? false,
        emailBillingAlerts: notificationSettings.emailBillingAlerts ?? true,
        browserNotifications: notificationSettings.browserNotifications ?? true,
        smsAlerts: notificationSettings.smsAlerts ?? false,
      });
    }
  }, [notificationSettings]);

  // Handle save based on active tab
  const handleSave = () => {
    setError(null);
    switch (activeTab) {
      case 'profile':
        updateProfile.mutate({
          name: profileForm.name,
          email: profileForm.email,
          phone: profileForm.phone,
        });
        // Also update timezone via tenant settings
        updateTenantSettings.mutate({ timezone: profileForm.timezone });
        break;
      case 'business':
        updateTenantSettings.mutate({
          name: businessForm.companyName,
          website: businessForm.website,
          industry: businessForm.industry,
        });
        break;
      case 'notifications':
        updateNotifications.mutate(notificationForm);
        break;
      case 'security':
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
          setError('Passwords do not match');
          return;
        }
        if (passwordForm.newPassword.length < 8) {
          setError('Password must be at least 8 characters');
          return;
        }
        changePassword.mutate(passwordForm);
        break;
    }
  };

  // Copy API key to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isLoading = updateProfile.isPending || updateTenantSettings.isPending ||
                    updateNotifications.isPending || changePassword.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ios-dark">Settings</h1>
        <p className="text-ios-secondary mt-1">Manage your account and preferences</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-black/10">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-apple-green text-apple-green'
                  : 'border-transparent text-ios-secondary hover:text-ios-dark'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <X className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Tab Content */}
      <div className="max-w-2xl">
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-6">Profile Settings</h2>
            <div className="space-y-5">
              {/* Photo */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-ios-gray flex items-center justify-center overflow-hidden shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile photo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-semibold text-ios-secondary">
                      {profileForm.name?.charAt(0)?.toUpperCase() || 'U'}
                    </span>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAvatar(f);
                  }}
                />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="btn-apple btn-apple-outline text-sm inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {avatarUploading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                    : <><Camera className="w-4 h-4" /> Change Photo</>}
                </button>
                <div className="text-xs">
                  <p className="text-ios-muted">JPG, PNG or WebP. Max 5MB.</p>
                  {avatarError && <p className="text-apple-red mt-0.5">{avatarError}</p>}
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="input-apple w-full max-w-md"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Email</label>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="input-apple w-full max-w-md"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="input-apple w-full max-w-md"
                />
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Timezone</label>
                <select
                  value={profileForm.timezone}
                  onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })}
                  className="input-apple w-full max-w-sm"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="btn-apple btn-wa-green flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* Business Tab */}
        {activeTab === 'business' && (
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-6">Business Information</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={businessForm.companyName}
                  onChange={(e) => setBusinessForm({ ...businessForm, companyName: e.target.value })}
                  className="input-apple w-full max-w-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Website</label>
                <input
                  type="url"
                  value={businessForm.website}
                  onChange={(e) => setBusinessForm({ ...businessForm, website: e.target.value })}
                  className="input-apple w-full max-w-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Industry</label>
                <select
                  value={businessForm.industry}
                  onChange={(e) => setBusinessForm({ ...businessForm, industry: e.target.value })}
                  className="input-apple w-full max-w-sm"
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Company Size</label>
                <select
                  value={businessForm.companySize}
                  onChange={(e) => setBusinessForm({ ...businessForm, companySize: e.target.value })}
                  className="input-apple w-full max-w-sm"
                >
                  {COMPANY_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Address</label>
                <input
                  type="text"
                  value={businessForm.address}
                  onChange={(e) => setBusinessForm({ ...businessForm, address: e.target.value })}
                  className="input-apple w-full max-w-md"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="btn-apple btn-wa-green flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-6">Notification Preferences</h2>
            <div className="space-y-4">
              {[
                { key: 'emailNewMessages', label: 'New message notifications', desc: 'Get notified when you receive new WhatsApp messages' },
                { key: 'emailDeliveryReports', label: 'Delivery reports', desc: 'Receive delivery and read status updates' },
                { key: 'emailWeeklyDigest', label: 'Weekly digest', desc: 'Summary of your messaging activity' },
                { key: 'emailBillingAlerts', label: 'Billing alerts', desc: 'Get alerts about low credit balance' },
                { key: 'browserNotifications', label: 'Browser notifications', desc: 'Desktop notifications for real-time updates' },
                { key: 'smsAlerts', label: 'SMS alerts', desc: 'Critical alerts via SMS (may incur charges)' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-4 border border-black/5 rounded-apple-lg">
                  <div>
                    <p className="font-medium text-ios-dark">{label}</p>
                    <p className="text-sm text-ios-muted mt-0.5">{desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
                    <input
                      type="checkbox"
                      checked={(notificationForm as any)[key]}
                      onChange={(e) => setNotificationForm({ ...notificationForm, [key]: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-ios-gray peer-focus:ring-2 peer-focus:ring-apple-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-apple-green"></div>
                  </label>
                </div>
              ))}
            </div>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="btn-apple btn-wa-green flex items-center gap-2 mt-6"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved!' : 'Save Preferences'}
            </button>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Change Password */}
            <div className="card-apple p-6">
              <h2 className="text-lg font-semibold text-ios-dark mb-4">Change Password</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Current Password</label>
                  <div className="relative">
                    <input
                      type={showPassword.current ? 'text' : 'password'}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      className="input-apple w-full max-w-sm pr-10"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword({ ...showPassword, current: !showPassword.current })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-muted"
                    >
                      {showPassword.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword.new ? 'text' : 'password'}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      className="input-apple w-full max-w-sm pr-10"
                      placeholder="Min. 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword({ ...showPassword, new: !showPassword.new })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-muted"
                    >
                      {showPassword.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ios-secondary mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showPassword.confirm ? 'text' : 'password'}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="input-apple w-full max-w-sm pr-10"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword({ ...showPassword, confirm: !showPassword.confirm })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-muted"
                    >
                      {showPassword.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleSave}
                  disabled={isLoading || !passwordForm.currentPassword || !passwordForm.newPassword}
                  className="btn-apple btn-wa-green flex items-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Update Password
                </button>
              </div>
            </div>

            {/* 2FA */}
            <div className="card-apple p-6">
              <h2 className="text-lg font-semibold text-ios-dark mb-4">Two-Factor Authentication</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ios-dark">Authenticator App</p>
                  <p className="text-sm text-ios-muted mt-0.5">Use an authenticator app for additional security</p>
                </div>
                {twoFactorStatus?.enabled ? (
                  <button
                    onClick={() => {
                      const password = prompt('Enter your password to disable 2FA:');
                      if (password) {
                        disable2FA.mutate(password);
                      }
                    }}
                    className="btn-apple bg-red-500 text-white hover:bg-red-600"
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    onClick={() => setup2FA.mutate()}
                    disabled={setup2FA.isPending}
                    className="btn-apple btn-apple-outline text-sm flex items-center gap-2"
                  >
                    {setup2FA.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Enable
                  </button>
                )}
              </div>
            </div>

            {/* Active Sessions */}
            <div className="card-apple p-6">
              <h2 className="text-lg font-semibold text-ios-dark mb-4">Active Sessions</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border border-black/5 rounded-lg">
                  <div>
                    <p className="font-medium text-ios-dark text-sm">Current Session</p>
                    <p className="text-xs text-ios-muted">This device • Active now</p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-apple-green/20 text-apple-green rounded-full">Active</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-6">Integrations</h2>
            <div className="space-y-4">
              {[
                { name: 'Shopify', desc: 'Sync products and customers' },
                { name: 'Zapier', desc: 'Automate workflows' },
                { name: 'HubSpot', desc: 'CRM integration' },
                { name: 'Google Sheets', desc: 'Export data to spreadsheets' },
              ].map((integration) => (
                <div key={integration.name} className="flex items-center justify-between p-4 border border-black/5 rounded-apple-lg">
                  <div>
                    <p className="font-medium text-ios-dark">{integration.name}</p>
                    <p className="text-sm text-ios-muted">{integration.desc}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-apple-full font-medium bg-ios-gray text-ios-muted">Coming Soon</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api' && (
          <div className="card-apple p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-ios-dark">API Keys</h2>
              <button
                onClick={() => setShowKeyModal(true)}
                className="btn-apple btn-wa-green text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Generate Key
              </button>
            </div>

            <div className="space-y-3">
              {apiKeys && apiKeys.length > 0 ? apiKeys.map((apiKey: any) => (
                <div key={apiKey.id} className="flex items-center justify-between p-4 border border-black/5 rounded-apple-lg">
                  <div>
                    <p className="font-medium text-ios-dark">{apiKey.name}</p>
                    <p className="text-sm text-ios-muted font-mono mt-1">
                      {apiKey.key ? `${apiKey.key.substring(0, 15)}${'•'.repeat(20)}` : 'wa_••••••••••••••••••••••••'}
                    </p>
                    <p className="text-xs text-ios-muted mt-1">Created: {new Date(apiKey.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKey.key && (
                      <button
                        onClick={() => copyToClipboard(apiKey.key)}
                        className="btn-apple btn-apple-outline text-sm py-1.5 flex items-center gap-1"
                      >
                        {copiedKey === apiKey.key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedKey === apiKey.key ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                    <button
                      onClick={() => deleteApiKey.mutate(apiKey.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-ios-muted">
                  <Key className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No API keys yet</p>
                  <p className="text-sm">Generate your first API key to start integrating</p>
                </div>
              )}
            </div>

            <div className="mt-6 p-4 bg-ios-gray rounded-apple-lg">
              <h3 className="font-medium text-ios-dark mb-2">API Documentation</h3>
              <p className="text-sm text-ios-secondary">
                Refer to our API documentation for integration guidelines.
              </p>
              <a href="#" className="text-sm text-apple-green hover:underline mt-1 inline-block">
                View Documentation →
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 2FA Setup Modal */}
      {show2FASetup && twoFactorData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ios-dark flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Setup Two-Factor Authentication
              </h3>
              <button onClick={() => setShow2FASetup(false)} className="text-ios-muted hover:text-ios-dark">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-ios-secondary">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </p>

              {/* QR Code placeholder */}
              <div className="flex justify-center p-4 bg-white border-2 border-dashed border-ios-gray rounded-lg">
                <div className="w-48 h-48 bg-ios-gray flex items-center justify-center">
                  <QrCode className="w-24 h-24 text-ios-dark" />
                </div>
              </div>

              <div className="p-3 bg-ios-gray rounded-lg">
                <p className="text-xs text-ios-muted mb-1">Manual entry code:</p>
                <p className="font-mono text-sm tracking-wider">{twoFactorData.manualEntry}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Verification Code</label>
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="input-apple w-full text-center text-lg tracking-widest"
                />
              </div>

              <button
                onClick={() => enable2FA.mutate(verifyCode)}
                disabled={verifyCode.length !== 6 || enable2FA.isPending}
                className="btn-apple btn-wa-green w-full"
              >
                {enable2FA.isPending ? 'Verifying...' : 'Enable 2FA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ios-dark">Generate API Key</h3>
              <button onClick={() => setShowKeyModal(false)} className="text-ios-muted hover:text-ios-dark">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production, Development"
                  className="input-apple w-full"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowKeyModal(false)}
                  className="btn-apple btn-apple-outline flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createApiKey.mutate(newKeyName)}
                  disabled={!newKeyName.trim() || createApiKey.isPending}
                  className="btn-apple btn-wa-green flex-1"
                >
                  {createApiKey.isPending ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Key Reveal Modal (shown once, right after creation) */}
      {revealedKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ios-dark flex items-center gap-2">
                <Key className="w-5 h-5" />
                {revealedKey.name}
              </h3>
              <button onClick={() => setRevealedKey(null)} className="text-ios-muted hover:text-ios-dark">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-apple-lg text-sm text-amber-700 mb-4">
              Copy this key now — for security, you won't be able to see it again.
            </div>
            <div className="flex items-center gap-2 p-3 bg-ios-gray rounded-apple-lg mb-4">
              <code className="flex-1 text-sm font-mono text-ios-dark break-all">{revealedKey.key}</code>
              <button
                onClick={() => copyToClipboard(revealedKey.key)}
                className="btn-apple btn-apple-outline text-sm py-1.5 flex items-center gap-1 flex-shrink-0"
              >
                {copiedKey === revealedKey.key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === revealedKey.key ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              onClick={() => setRevealedKey(null)}
              className="btn-apple btn-wa-green w-full"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
