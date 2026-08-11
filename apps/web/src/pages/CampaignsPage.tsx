/**
 * Campaigns Page - WhatsApp Campaign Management
 * Multi-step wizard for creating and managing campaigns
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Plus,
  Send,
  Calendar,
  BarChart3,
  X,
  Play,
  Pause,
  Trash2,
  Clock,
  Users,
  MessageSquare,
  Image,
  ChevronRight,
  ChevronLeft,
  Check,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Copy,
  Edit3,
  Zap,
  Globe,
  Phone,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused';
  type: 'broadcast' | 'automated' | 'followup';
  segment: string;
  sent: number;
  delivered: number;
  read: number;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
}

interface Segment {
  id: string;
  name: string;
  contacts: number;
  criteria: string;
}

interface Template {
  id: string;
  name: string;
  category: string;
  status: 'approved' | 'pending' | 'rejected';
  preview: string;
}

interface PhoneNumberOption {
  id: string;
  phoneNumber: string;
  displayName: string;
  hasMetaId: boolean;
}

// Steps for campaign creation wizard
const WIZARD_STEPS = [
  { id: 1, name: 'Audience', icon: Users, description: 'Select recipients' },
  { id: 2, name: 'Message', icon: MessageSquare, description: 'Compose content' },
  { id: 3, name: 'Phone', icon: Phone, description: 'Select phone number' },
  { id: 4, name: 'Schedule', icon: Calendar, description: 'Set timing' },
  { id: 5, name: 'Review', icon: Eye, description: 'Confirm & launch' },
];

export default function CampaignsPage() {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [wizardStep, setWizardStep] = useState(1);
  const [tab, setTab] = useState<'all' | 'sent' | 'scheduled' | 'draft' | 'sending'>('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const queryClient = useQueryClient();

  // Show notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Campaign form state
  const [form, setForm] = useState({
    name: '',
    segmentId: '',
    templateId: '',
    phoneNumberId: '',
    message: '',
    scheduleType: 'now' as 'now' | 'scheduled',
    scheduledAt: '',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  // Fetch campaigns
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', tab],
    queryFn: async () => {
      const response = await api.get('/campaigns', { params: { tab } });
      return response.data;
    },
  });

  // Fetch segments for audience selection
  const { data: segmentsData } = useQuery({
    queryKey: ['segments'],
    queryFn: async () => {
      const response = await api.get('/segments');
      return response.data;
    },
  });

  // Fetch templates
  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await api.get('/templates');
      return response.data;
    },
  });

  // Fetch contacts count for "All Contacts" option
  const { data: contactsData } = useQuery({
    queryKey: ['contacts-count'],
    queryFn: async () => {
      const response = await api.get('/contacts', { params: { limit: 1 } });
      return response.data;
    },
  });

  // Fetch phone numbers for sending
  const { data: phoneNumbersData } = useQuery({
    queryKey: ['phone-numbers'],
    queryFn: async () => {
      const response = await api.get('/phone-numbers');
      return response.data;
    },
  });

  // Transform phone numbers
  const phoneNumbers: PhoneNumberOption[] = (phoneNumbersData?.data || []).map((p: any) => ({
    id: p.id,
    phoneNumber: p.phoneNumber,
    displayName: p.displayName || p.phoneNumber,
    hasMetaId: !!p.metaPhoneId,
  }));

  // Create campaign mutation
  const createMutation = useMutation({
    mutationFn: async (campaign: any) => {
      const response = await api.post('/campaigns', campaign);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      showNotification('success', 'Campaign created successfully!');
      resetForm();
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to create campaign';
      showNotification('error', message);
    },
  });

  // Update campaign status mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await api.patch(`/campaigns/${id}`, { status });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  // Delete campaign mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/campaigns/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setShowDeleteConfirm(null);
      showNotification('success', 'Campaign deleted successfully');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Failed to delete campaign';
      showNotification('error', message);
    },
  });

  // Transform data
  const campaigns: Campaign[] = (data?.data || []).map((c: any) => ({
    id: c.id,
    name: c.name || 'Untitled Campaign',
    status: c.status?.toLowerCase() || 'draft',
    type: c.isDrip ? 'automated' : 'broadcast',
    segment: c.audienceType || 'Unknown',
    sent: c.totalSent || 0,
    delivered: c.totalDelivered || 0,
    read: c.totalRead || 0,
    scheduledAt: c.scheduledAt,
    sentAt: c.completedAt,
    createdAt: c.createdAt,
  }));

  const segments: Segment[] = (segmentsData?.data || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    contacts: s.totalContacts || 0,
    criteria: s.query ? JSON.stringify(s.query) : '',
  }));

  const templates: Template[] = (templatesData?.data || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    status: t.status,
    preview: t.body?.text || t.body || '',
  }));

  const totalContacts = contactsData?.meta?.total || 0;
  const selectedSegment = segments.find(s => s.id === form.segmentId);
  const selectedTemplate = templates.find(t => t.id === form.templateId);
  const selectedPhoneNumber = phoneNumbers.find(p => p.id === form.phoneNumberId);

  // Reset form
  const resetForm = () => {
    setView('list');
    setWizardStep(1);
    setForm({
      name: '',
      segmentId: '',
      templateId: '',
      phoneNumberId: '',
      message: '',
      scheduleType: 'now',
      scheduledAt: '',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  // Handle next step with validation
  const nextStep = () => {
    if (wizardStep === 1 && !form.name) {
      return; // Name is required
    }
    if (wizardStep === 2 && !form.message) {
      return; // Message is required
    }
    if (wizardStep === 3 && !form.phoneNumberId) {
      return; // Phone number is required
    }
    if (wizardStep < 5) setWizardStep(wizardStep + 1);
  };

  // Handle prev step
  const prevStep = () => {
    if (wizardStep > 1) setWizardStep(wizardStep - 1);
  };

  // Handle form submit
  const handleSubmit = () => {
    // Determine audience type based on selection
    let audienceType: 'all' | 'segment' | 'contacts' = 'segment';
    let segmentIds: string[] = [];
    let contactIds: string[] = [];

    if (form.segmentId === 'all') {
      audienceType = 'all';
    } else if (form.segmentId) {
      audienceType = 'segment';
      segmentIds = [form.segmentId];
    }

    createMutation.mutate({
      name: form.name,
      templateId: form.templateId || null,
      phoneNumberId: form.phoneNumberId || null,
      audienceType,
      segmentIds,
      contactIds,
      scheduledAt: form.scheduleType === 'scheduled' ? form.scheduledAt : null,
    });
  };

  // Filter campaigns by tab
  const filtered = campaigns.filter(c => {
    if (tab === 'all') return true;
    if (tab === 'sent') return c.status === 'sent';
    if (tab === 'scheduled') return c.status === 'scheduled';
    if (tab === 'sending') return c.status === 'sending';
    if (tab === 'draft') return c.status === 'draft';
    return true;
  });

  // Status colors
  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-ios-gray', text: 'text-ios-muted', label: 'Draft' },
    scheduled: { bg: 'bg-wa-teal/20', text: 'text-wa-teal', label: 'Scheduled' },
    sending: { bg: 'bg-wa-green/20', text: 'text-wa-green', label: 'Sending' },
    sent: { bg: 'bg-apple-green/20', text: 'text-apple-green', label: 'Sent' },
    paused: { bg: 'bg-apple-orange/20', text: 'text-apple-orange', label: 'Paused' },
    cancelled: { bg: 'bg-apple-red/20', text: 'text-apple-red', label: 'Cancelled' },
    failed: { bg: 'bg-apple-red/20', text: 'text-apple-red', label: 'Failed' },
  };

  // List View
  if (view === 'list') {
    return (
      <div className="space-y-6">
        {/* Notification Toast */}
        {notification && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-apple-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-right ${
            notification.type === 'success'
              ? 'bg-apple-green text-white'
              : 'bg-apple-red text-white'
          }`}>
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gradient-wa">Campaigns</h1>
            <p className="text-ios-secondary mt-1">
              {filtered.length} {tab === 'all' ? 'total' : tab} campaigns
            </p>
          </div>
          <button
            onClick={() => setView('create')}
            className="btn-apple bg-wa-gradient text-white flex items-center gap-2 shadow-wa hover:shadow-wa-hover transition"
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-black/10">
          {(['all', 'sent', 'scheduled', 'sending', 'draft'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium transition relative ${
                tab === t
                  ? 'text-wa-green'
                  : 'text-ios-muted hover:text-ios-dark'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {tab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-wa-gradient" />
              )}
            </button>
          ))}
        </div>

        {/* Campaign Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card-apple p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-ios-muted">Total Sent</p>
                <p className="text-xl font-bold text-ios-dark">
                  {campaigns.reduce((sum, c) => sum + c.sent, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="card-apple p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-wa-teal/20 text-wa-teal rounded-apple-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-ios-muted">Delivered</p>
                <p className="text-xl font-bold text-ios-dark">
                  {campaigns.reduce((sum, c) => sum + c.delivered, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <div className="card-apple p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-apple-purple/20 text-apple-purple rounded-apple-lg flex items-center justify-center">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-ios-muted">Read Rate</p>
                <p className="text-xl font-bold text-ios-dark">
                  {campaigns.reduce((sum, c) => sum + c.delivered, 0) > 0
                    ? Math.round(
                        (campaigns.reduce((sum, c) => sum + c.read, 0) /
                          campaigns.reduce((sum, c) => sum + c.delivered, 0)) *
                          100
                      )
                    : 0}
                  %
                </p>
              </div>
            </div>
          </div>
          <div className="card-apple p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-apple-orange/20 text-apple-orange rounded-apple-lg flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-ios-muted">Scheduled</p>
                <p className="text-xl font-bold text-ios-dark">
                  {campaigns.filter(c => c.status === 'scheduled').length}
                </p>
              </div>
            </div>
          </div>
          <div className="card-apple p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-apple-red/20 text-apple-red rounded-apple-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-ios-muted">Failed</p>
                <p className="text-xl font-bold text-ios-dark">
                  {campaigns.filter(c => ['failed', 'cancelled'].includes(c.status)).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Campaigns List */}
        {isLoading ? (
          <div className="card-apple p-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-wa-green" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-apple p-12 text-center">
            <div className="w-16 h-16 bg-ios-gray rounded-full flex items-center justify-center mx-auto mb-4">
              <Send className="w-8 h-8 text-ios-muted" />
            </div>
            <h3 className="text-lg font-semibold text-ios-dark mb-2">No campaigns yet</h3>
            <p className="text-ios-muted mb-6">Create your first campaign to reach your audience</p>
            <button
              onClick={() => setView('create')}
              className="btn-apple bg-wa-gradient text-white shadow-wa hover:shadow-wa-hover transition"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Campaign
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((campaign) => {
              const status = statusColors[campaign.status] || statusColors.draft;
              return (
                <div key={campaign.id} className="card-apple p-5 hover:shadow-apple-hover transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-apple-xl flex items-center justify-center ${
                        campaign.status === 'sent' ? 'bg-apple-green/20' :
                        campaign.status === 'scheduled' ? 'bg-wa-teal/20' :
                        campaign.status === 'sending' ? 'bg-wa-green/20' :
                        'bg-ios-gray'
                      }`}>
                        <Send className={`w-6 h-6 ${
                          campaign.status === 'sent' ? 'text-apple-green' :
                          campaign.status === 'scheduled' ? 'text-wa-teal' :
                          campaign.status === 'sending' ? 'text-wa-green' :
                          'text-ios-muted'
                        }`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-ios-dark">{campaign.name}</h3>
                        <div className="flex items-center gap-3 mt-1 text-sm text-ios-muted">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {campaign.segment}
                          </span>
                          <span>•</span>
                          <span>{new Date(campaign.createdAt).toLocaleDateString()}</span>
                          {campaign.status === 'sent' && campaign.sentAt && (
                            <>
                              <span>•</span>
                              <span>Sent {new Date(campaign.sentAt).toLocaleDateString()}</span>
                            </>
                          )}
                          {campaign.status === 'scheduled' && campaign.scheduledAt && (
                            <>
                              <span>•</span>
                              <span className="text-wa-teal">
                                Scheduled for {new Date(campaign.scheduledAt).toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Stats */}
                      {campaign.status !== 'draft' && (
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-center">
                            <p className="font-semibold text-ios-dark">{campaign.sent.toLocaleString()}</p>
                            <p className="text-xs text-ios-muted">Sent</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-ios-dark">
                              {campaign.sent > 0 ? Math.round((campaign.delivered / campaign.sent) * 100) : 0}%
                            </p>
                            <p className="text-xs text-ios-muted">Delivered</p>
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-ios-dark">
                              {campaign.delivered > 0 ? Math.round((campaign.read / campaign.delivered) * 100) : 0}%
                            </p>
                            <p className="text-xs text-ios-muted">Read</p>
                          </div>
                        </div>
                      )}

                      {/* Status Badge */}
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {campaign.status === 'draft' && (
                          <>
                            <button
                              onClick={() => updateMutation.mutate({ id: campaign.id, status: 'sending' })}
                              className="p-2 hover:bg-ios-gray rounded-apple-lg transition"
                              title="Launch"
                            >
                              <Play className="w-4 h-4 text-wa-green" />
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(campaign.id)}
                              className="p-2 hover:bg-ios-gray rounded-apple-lg transition"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-apple-red" />
                            </button>
                          </>
                        )}
                        {campaign.status === 'scheduled' && (
                          <button
                            onClick={() => updateMutation.mutate({ id: campaign.id, status: 'paused' })}
                            className="p-2 hover:bg-ios-gray rounded-apple-lg transition"
                            title="Pause"
                          >
                            <Pause className="w-4 h-4 text-apple-orange" />
                          </button>
                        )}
                        {campaign.status === 'sending' && (
                          <button
                            onClick={() => updateMutation.mutate({ id: campaign.id, status: 'paused' })}
                            className="p-2 hover:bg-ios-gray rounded-apple-lg transition"
                            title="Pause"
                          >
                            <Pause className="w-4 h-4 text-apple-orange" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="card-apple p-6 w-full max-w-md mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-apple-red/20 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-apple-red" />
                </div>
                <h3 className="text-lg font-semibold text-ios-dark">Delete Campaign?</h3>
              </div>
              <p className="text-ios-secondary mb-6">
                This action cannot be undone. The campaign and its statistics will be permanently removed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 btn-apple bg-ios-gray text-ios-dark"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteMutation.mutate(showDeleteConfirm)}
                  className="flex-1 btn-apple bg-apple-red text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Create/Edit View - Multi-step Wizard
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={resetForm}
            className="p-2 hover:bg-ios-gray rounded-apple-lg transition"
          >
            <X className="w-5 h-5 text-ios-muted" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gradient-wa">New Campaign</h1>
            <p className="text-ios-secondary mt-1">Create a WhatsApp broadcast campaign</p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="card-apple p-6">
        <div className="flex items-center justify-between">
          {WIZARD_STEPS.map((step, index) => {
            const isActive = wizardStep === step.id;
            const isCompleted = wizardStep > step.id;
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => isCompleted && setWizardStep(step.id)}
                  disabled={!isCompleted && !isActive}
                  className={`flex items-center gap-3 ${!isCompleted && !isActive ? 'opacity-50' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
                    isActive ? 'bg-wa-gradient text-white shadow-wa' :
                    isCompleted ? 'bg-wa-green/20 text-wa-green' :
                    'bg-ios-gray text-ios-muted'
                  }`}>
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="hidden md:block">
                    <p className={`font-medium ${isActive ? 'text-wa-green' : 'text-ios-dark'}`}>
                      {step.name}
                    </p>
                    <p className="text-xs text-ios-muted">{step.description}</p>
                  </div>
                </button>
                {index < WIZARD_STEPS.length - 1 && (
                  <div className={`w-16 md:w-24 h-0.5 mx-4 ${
                    isCompleted ? 'bg-wa-green' : 'bg-ios-gray'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="card-apple p-6">
        {/* Step 1: Audience Selection */}
        {wizardStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-ios-dark mb-2">Select Audience</h2>
              <p className="text-ios-muted">Choose who will receive this campaign message</p>
            </div>

            {/* Campaign Name */}
            <div>
              <label className="block text-sm font-medium text-ios-dark mb-2">Campaign Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Summer Sale Announcement"
                className="input-apple w-full"
              />
            </div>

            {/* Segment Selection */}
            <div>
              <label className="block text-sm font-medium text-ios-dark mb-2">Recipients</label>
              <div className="grid grid-cols-2 gap-4">
                {/* All Contacts Option */}
                <button
                  onClick={() => setForm({ ...form, segmentId: 'all' })}
                  className={`p-4 border rounded-apple-xl text-left transition ${
                    form.segmentId === 'all'
                      ? 'border-wa-green bg-wa-green/5 ring-2 ring-wa-green'
                      : 'border-black/10 hover:border-wa-green/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-apple-lg flex items-center justify-center ${
                      form.segmentId === 'all' ? 'bg-wa-gradient text-white' : 'bg-ios-gray text-ios-muted'
                    }`}>
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-ios-dark">All Contacts</p>
                      <p className="text-sm text-ios-muted">{totalContacts} contacts</p>
                    </div>
                  </div>
                </button>

                {/* Segment Options */}
                {segments.map((segment) => (
                  <button
                    key={segment.id}
                    onClick={() => setForm({ ...form, segmentId: segment.id })}
                    className={`p-4 border rounded-apple-xl text-left transition ${
                      form.segmentId === segment.id
                        ? 'border-wa-green bg-wa-green/5 ring-2 ring-wa-green'
                        : 'border-black/10 hover:border-wa-green/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-ios-dark">{segment.name}</p>
                      <span className="text-sm bg-wa-green/20 text-wa-green px-2 py-0.5 rounded-full">
                        {segment.contacts}
                      </span>
                    </div>
                    <p className="text-xs text-ios-muted truncate">{segment.criteria}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Summary */}
            {form.segmentId && (
              <div className="bg-wa-green/10 border border-wa-green/20 rounded-apple-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-wa-green" />
                  <div>
                    <p className="font-medium text-wa-green">
                      {form.segmentId === 'all' ? `${totalContacts} contacts` : `${selectedSegment?.contacts || 0} contacts`}
                    </p>
                    <p className="text-sm text-ios-muted">
                      {form.segmentId === 'all' ? 'All contacts in your list' : `Segment: ${selectedSegment?.name}`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Message Composition */}
        {wizardStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-ios-dark mb-2">Compose Message</h2>
              <p className="text-ios-muted">Write your campaign message content</p>
            </div>

            {/* Template Selection */}
            <div>
              <label className="block text-sm font-medium text-ios-dark mb-2">Use Template (Optional)</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setForm({ ...form, templateId: '', message: '' })}
                  className={`p-4 border rounded-apple-lg text-left transition ${
                    !form.templateId
                      ? 'border-wa-green bg-wa-green/5 ring-2 ring-wa-green'
                      : 'border-black/10 hover:border-wa-green/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Edit3 className="w-4 h-4 text-wa-green" />
                    <span className="font-medium text-ios-dark text-sm">Blank</span>
                  </div>
                  <p className="text-xs text-ios-muted">Start from scratch</p>
                </button>
                {templates.slice(0, 4).map((template) => (
                  <button
                    key={template.id}
                    onClick={() => {
                      setForm({ ...form, templateId: template.id, message: template.preview });
                    }}
                    className={`p-4 border rounded-apple-lg text-left transition ${
                      form.templateId === template.id
                        ? 'border-wa-green bg-wa-green/5 ring-2 ring-wa-green'
                        : 'border-black/10 hover:border-wa-green/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-4 h-4 text-wa-green" />
                      <span className="font-medium text-ios-dark text-sm truncate">{template.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        template.status === 'approved' ? 'bg-apple-green/20 text-apple-green' :
                        template.status === 'pending' ? 'bg-apple-orange/20 text-apple-orange' :
                        'bg-apple-red/20 text-apple-red'
                      }`}>
                        {template.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Message Editor */}
            <div>
              <label className="block text-sm font-medium text-ios-dark mb-2">Message Content</label>
              <div className="relative">
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Type your message here...&#10;&#10;Use {name} for personalization&#10;Use {product} for dynamic content"
                  className="input-apple w-full h-40 resize-none"
                />
                <div className="absolute bottom-3 right-3 text-xs text-ios-muted">
                  {form.message.length} / 1024
                </div>
              </div>
              <div className="flex gap-4 mt-3">
                <button className="flex items-center gap-2 text-sm text-wa-green hover:text-wa-teal transition">
                  <Image className="w-4 h-4" />
                  Add Media
                </button>
                <button className="flex items-center gap-2 text-sm text-wa-green hover:text-wa-teal transition">
                  <Zap className="w-4 h-4" />
                  Add Variables
                </button>
              </div>
            </div>

            {/* Preview */}
            {form.message && (
              <div className="bg-ios-gray/50 rounded-apple-lg p-4">
                <p className="text-xs text-ios-muted mb-2">Preview</p>
                <div className="bg-white rounded-apple-lg p-4 border border-black/10">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-wa-gradient rounded-full flex items-center justify-center flex-shrink-0">
                      <Phone className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-wa-green/10 rounded-apple-lg rounded-tl-none p-3">
                        <p className="text-sm text-ios-dark whitespace-pre-wrap">{form.message}</p>
                      </div>
                      <p className="text-xs text-ios-muted mt-1">12:00 PM</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Phone Number Selection */}
        {wizardStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-ios-dark mb-2">Select Phone Number</h2>
              <p className="text-ios-muted">Choose the WhatsApp number to send messages from</p>
            </div>

            {/* Phone Number Selection */}
            <div className="space-y-3">
              {phoneNumbers.length === 0 ? (
                <div className="text-center py-8">
                  <Phone className="w-12 h-12 text-ios-muted mx-auto mb-3 opacity-50" />
                  <p className="text-ios-secondary">No WhatsApp numbers connected</p>
                  <p className="text-sm text-ios-muted">Connect a WhatsApp Business number in Settings</p>
                </div>
              ) : (
                phoneNumbers.map((phone) => (
                  <button
                    key={phone.id}
                    onClick={() => setForm({ ...form, phoneNumberId: phone.id })}
                    className={`w-full p-4 border rounded-apple-xl text-left transition ${
                      form.phoneNumberId === phone.id
                        ? 'border-wa-green bg-wa-green/5 ring-2 ring-wa-green'
                        : 'border-black/10 hover:border-wa-green/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-apple-lg flex items-center justify-center ${
                          form.phoneNumberId === phone.id ? 'bg-wa-gradient text-white' : 'bg-ios-gray text-ios-muted'
                        }`}>
                          <Phone className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium text-ios-dark">{phone.displayName}</p>
                          <p className="text-sm text-ios-muted">{phone.phoneNumber}</p>
                        </div>
                      </div>
                      {phone.hasMetaId ? (
                        <span className="text-xs bg-apple-green/20 text-apple-green px-2 py-1 rounded-full">
                          Ready
                        </span>
                      ) : (
                        <span className="text-xs bg-apple-orange/20 text-apple-orange px-2 py-1 rounded-full">
                          Setup Required
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Selected Summary */}
            {form.phoneNumberId && selectedPhoneNumber && (
              <div className="bg-wa-green/10 border border-wa-green/20 rounded-apple-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-wa-green" />
                  <div>
                    <p className="font-medium text-wa-green">Phone selected: {selectedPhoneNumber.displayName}</p>
                    <p className="text-sm text-ios-muted">{selectedPhoneNumber.phoneNumber}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4 (moved): Schedule */}
        {wizardStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-ios-dark mb-2">Set Schedule</h2>
              <p className="text-ios-muted">Choose when to send your campaign</p>
            </div>

            {/* Schedule Options */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setForm({ ...form, scheduleType: 'now' })}
                className={`p-6 border rounded-apple-xl text-left transition ${
                  form.scheduleType === 'now'
                    ? 'border-wa-green bg-wa-green/5 ring-2 ring-wa-green'
                    : 'border-black/10 hover:border-wa-green/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-apple-lg flex items-center justify-center ${
                    form.scheduleType === 'now' ? 'bg-wa-gradient text-white' : 'bg-ios-gray text-ios-muted'
                  }`}>
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-ios-dark">Send Now</p>
                    <p className="text-sm text-ios-muted">Launch immediately</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-wa-green">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Messages sent instantly</span>
                </div>
              </button>

              <button
                onClick={() => setForm({ ...form, scheduleType: 'scheduled' })}
                className={`p-6 border rounded-apple-xl text-left transition ${
                  form.scheduleType === 'scheduled'
                    ? 'border-wa-green bg-wa-green/5 ring-2 ring-wa-green'
                    : 'border-black/10 hover:border-wa-green/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-apple-lg flex items-center justify-center ${
                    form.scheduleType === 'scheduled' ? 'bg-wa-gradient text-white' : 'bg-ios-gray text-ios-muted'
                  }`}>
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-ios-dark">Schedule</p>
                    <p className="text-sm text-ios-muted">Send later</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-wa-green">
                  <Clock className="w-4 h-4" />
                  <span>Pick date & time</span>
                </div>
              </button>
            </div>

            {/* Date/Time Picker */}
            {form.scheduleType === 'scheduled' && (
              <div className="bg-ios-gray/50 rounded-apple-lg p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ios-dark mb-2">Date</label>
                    <input
                      type="date"
                      value={form.scheduledAt.split('T')[0] || ''}
                      onChange={(e) => {
                        const date = new Date(e.target.value);
                        const time = form.scheduledAt.includes('T')
                          ? form.scheduledAt.split('T')[1]
                          : '09:00';
                        setForm({ ...form, scheduledAt: `${date.toISOString().split('T')[0]}T${time}` });
                      }}
                      className="input-apple w-full"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ios-dark mb-2">Time</label>
                    <input
                      type="time"
                      value={form.scheduledAt.includes('T')
                        ? form.scheduledAt.split('T')[1]?.substring(0, 5)
                        : '09:00'}
                      onChange={(e) => {
                        const date = form.scheduledAt.split('T')[0] || new Date().toISOString().split('T')[0];
                        setForm({ ...form, scheduledAt: `${date}T${e.target.value}` });
                      }}
                      className="input-apple w-full"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-ios-muted">
                  <Globe className="w-4 h-4" />
                  <span>Timezone: {form.timeZone}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Review */}
        {wizardStep === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-ios-dark mb-2">Review & Launch</h2>
              <p className="text-ios-muted">Confirm your campaign details before sending</p>
            </div>

            {/* Summary */}
            <div className="space-y-4">
              <div className="bg-ios-gray/50 rounded-apple-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-ios-muted uppercase tracking-wide mb-1">Campaign Name</p>
                    <p className="font-medium text-ios-dark">{form.name || 'Untitled Campaign'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ios-muted uppercase tracking-wide mb-1">Recipients</p>
                    <p className="font-medium text-ios-dark">
                      {form.segmentId === 'all'
                        ? `${totalContacts} contacts (All)`
                        : selectedSegment
                          ? `${selectedSegment.contacts} contacts (${selectedSegment.name})`
                          : `${totalContacts} contacts (All)`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ios-muted uppercase tracking-wide mb-1">Template</p>
                    <p className="font-medium text-ios-dark">
                      {selectedTemplate?.name || 'Custom Message'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ios-muted uppercase tracking-wide mb-1">Phone Number</p>
                    <p className="font-medium text-ios-dark">
                      {selectedPhoneNumber?.displayName || 'Not selected'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ios-muted uppercase tracking-wide mb-1">Schedule</p>
                    <p className="font-medium text-ios-dark">
                      {form.scheduleType === 'now' ? 'Send Immediately' : form.scheduledAt ? new Date(form.scheduledAt).toLocaleString() : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Message Preview */}
              {form.message && (
                <div>
                  <p className="text-xs text-ios-muted uppercase tracking-wide mb-2">Message Preview</p>
                  <div className="bg-white rounded-apple-lg p-4 border border-black/10">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-wa-gradient rounded-full flex items-center justify-center flex-shrink-0">
                        <Phone className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="bg-wa-green/10 rounded-apple-lg rounded-tl-none p-3">
                          <p className="text-sm text-ios-dark whitespace-pre-wrap">{form.message}</p>
                        </div>
                        <p className="text-xs text-ios-muted mt-1">12:00 PM</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning */}
              <div className="bg-apple-orange/10 border border-apple-orange/20 rounded-apple-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-apple-orange flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-ios-dark">Before you launch:</p>
                    <ul className="text-ios-muted mt-1 space-y-1">
                      <li>• Ensure your message template is approved by Meta</li>
                      <li>• Verify recipient contacts have opted in</li>
                      <li>• Check that all variables are properly mapped</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevStep}
          disabled={wizardStep === 1}
          className="btn-apple flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={resetForm}
            className="btn-apple bg-ios-gray text-ios-dark"
          >
            Save as Draft
          </button>

          {wizardStep < 5 ? (
            <button
              onClick={nextStep}
              disabled={
                (wizardStep === 1 && !form.name) ||
                (wizardStep === 2 && !form.message) ||
                (wizardStep === 3 && !form.phoneNumberId)
              }
              className="btn-apple bg-wa-gradient text-white shadow-wa disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="btn-apple bg-wa-gradient text-white shadow-wa flex items-center gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Launching...
                </>
              ) : form.scheduleType === 'now' ? (
                <>
                  <Send className="w-4 h-4" />
                  Launch Campaign
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  Schedule Campaign
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
