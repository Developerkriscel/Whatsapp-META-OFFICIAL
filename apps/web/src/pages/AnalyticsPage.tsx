/**
 * Analytics Page - WhatsApp Business Analytics
 * Message delivery rates, open rates, response rates, revenue tracking
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, insightsApi } from '../api/client';
import {
  TrendingUp, TrendingDown, MessageSquare, Users, Send, Clock, CheckCircle,
  Eye, BarChart3, Download, Calendar, Filter, RefreshCw, AlertCircle,
  DollarSign, Target, Zap, ArrowUpRight, ArrowDownRight, Loader2, FileText,
  UserPlus
} from 'lucide-react';

type Period = '7d' | '30d' | '90d' | 'custom';

interface DateRange {
  start: string;
  end: string;
}

interface AnalyticsOverview {
  messaging: {
    totalSent: number;
    sentToday: number;
    sentThisWeek: number;
    sentThisMonth: number;
    deliveryRate: number;
    readRate: number;
  };
  contacts: {
    total: number;
    optedIn: number;
    optedOut: number;
    consentRate: number;
  };
  campaigns: {
    total: number;
    thisMonth: number;
  };
  inbox: {
    openConversations: number;
    avgResponseTime?: number;
  };
  whatsapp: {
    connectedPhones: number;
    qualityRatings: string[];
  };
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'insights'>('overview');

  // Original API calls
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', period, dateRange],
    queryFn: async () => {
      const params: any = { period };
      if (period === 'custom') {
        params.start = dateRange.start;
        params.end = dateRange.end;
      }
      const response = await api.get('/analytics/overview', { params });
      return response.data;
    },
  });

  const { data: metricsData } = useQuery({
    queryKey: ['analytics-metrics', period, dateRange],
    queryFn: async () => {
      const params: any = { period };
      if (period === 'custom') {
        params.start = dateRange.start;
        params.end = dateRange.end;
      }
      const response = await api.get('/analytics/metrics', { params });
      return response.data;
    },
  });

  const { data: campaignData } = useQuery({
    queryKey: ['analytics-campaigns', period, dateRange],
    queryFn: async () => {
      const params: any = { period };
      if (period === 'custom') {
        params.start = dateRange.start;
        params.end = dateRange.end;
      }
      const response = await api.get('/analytics/campaigns', { params });
      return response.data;
    },
  });

  // New Insights API
  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ['insights-overview'],
    queryFn: async () => {
      const response = await insightsApi.overview();
      return response.data.data as AnalyticsOverview;
    },
  });

  const { data: whatsappInsights } = useQuery({
    queryKey: ['insights-whatsapp'],
    queryFn: async () => {
      const response = await insightsApi.whatsapp();
      return response.data.data;
    },
  });

  const stats = data?.data || {
    totalMessages: 0,
    sentMessages: 0,
    deliveredMessages: 0,
    readMessages: 0,
    failedMessages: 0,
    activeContacts: 0,
    newContacts: 0,
    avgResponseTime: 0,
    responseRate: 0,
    totalRevenue: 0,
    revenuePerMessage: 0,
    topTemplate: '-',
    topCampaign: '-',
    conversationStats: { total: 0, open: 0, closed: 0, pending: 0 },
    dailyStats: [],
    campaignStats: [],
  };

  const metrics = metricsData?.data || {};
  const campaigns = campaignData?.data || [];

  // Use insights data
  const overview = insightsData || {
    messaging: { totalSent: 0, sentToday: 0, sentThisWeek: 0, sentThisMonth: 0, deliveryRate: 0, readRate: 0 },
    contacts: { total: 0, optedIn: 0, optedOut: 0, consentRate: 0 },
    campaigns: { total: 0, thisMonth: 0 },
    inbox: { openConversations: 0 },
    whatsapp: { connectedPhones: 0, qualityRatings: [] },
  };

  // Calculate rates
  const deliveryRate = stats.totalMessages > 0
    ? ((stats.deliveredMessages / stats.totalMessages) * 100).toFixed(1)
    : '0.0';
  const openRate = stats.deliveredMessages > 0
    ? ((stats.readMessages / stats.deliveredMessages) * 100).toFixed(1)
    : '0.0';
  const responseRate = stats.totalMessages > 0
    ? ((stats.responseRate || 0) * 100).toFixed(1)
    : '0.0';

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  // Format time
  const formatTime = (minutes: number) => {
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  // Export data
  const exportData = (format: 'csv' | 'json') => {
    const exportObj = { stats, campaigns, period, dateRange };
    const blob = format === 'json'
      ? new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' })
      : new Blob([convertToCSV(stats)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${period}-${new Date().toISOString().split('T')[0]}.${format}`;
    a.click();
  };

  const convertToCSV = (data: any) => {
    const headers = ['Metric', 'Value'];
    const rows = Object.entries(data).map(([key, value]) => [
      key.replace(/([A-Z])/g, ' $1').trim(),
      typeof value === 'object' ? JSON.stringify(value) : value,
    ]);
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-wa-green" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">Analytics</h1>
          <p className="text-ios-secondary mt-1">Track your WhatsApp Business performance</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="input-apple text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button onClick={() => exportData('csv')} className="btn-apple btn-outline text-sm flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-ios-gray">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-1 text-sm font-medium transition-colors ${
            activeTab === 'overview'
              ? 'text-wa-green border-b-2 border-wa-green'
              : 'text-ios-muted hover:text-ios-dark'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`pb-3 px-1 text-sm font-medium transition-colors ${
            activeTab === 'insights'
              ? 'text-wa-green border-b-2 border-wa-green'
              : 'text-ios-muted hover:text-ios-dark'
          }`}
        >
          Insights (New)
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ios-muted text-sm">Total Messages</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">
                    {stats.totalMessages.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-wa-green/10 rounded-apple-lg">
                  <MessageSquare className="w-6 h-6 text-wa-green" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-sm">
                {stats.sentMessages > stats.totalMessages - stats.sentMessages ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
                <span className="text-ios-muted">vs previous period</span>
              </div>
            </div>

            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ios-muted text-sm">Delivery Rate</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">{deliveryRate}%</p>
                </div>
                <div className="p-3 bg-blue-500/10 rounded-apple-lg">
                  <CheckCircle className="w-6 h-6 text-blue-500" />
                </div>
              </div>
              <p className="text-sm text-ios-muted mt-2">
                {stats.deliveredMessages.toLocaleString()} delivered
              </p>
            </div>

            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ios-muted text-sm">Active Contacts</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">
                    {stats.activeContacts.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-apple-purple/10 rounded-apple-lg">
                  <Users className="w-6 h-6 text-apple-purple" />
                </div>
              </div>
              <p className="text-sm text-ios-muted mt-2">
                +{stats.newContacts} new this period
              </p>
            </div>

            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ios-muted text-sm">Avg Response Time</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">
                    {formatTime(stats.avgResponseTime)}
                  </p>
                </div>
                <div className="p-3 bg-apple-orange/10 rounded-apple-lg">
                  <Clock className="w-6 h-6 text-apple-orange" />
                </div>
              </div>
              <p className="text-sm text-ios-muted mt-2">
                {responseRate}% response rate
              </p>
            </div>
          </div>

          {/* More Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Message Funnel */}
            <div className="card-apple p-6">
              <h3 className="text-lg font-semibold text-ios-dark mb-4">Message Funnel</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-ios-secondary">Sent</span>
                    <span className="text-ios-dark font-medium">{stats.sentMessages.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-ios-gray rounded-full overflow-hidden">
                    <div className="h-full bg-wa-green rounded-full" style={{ width: '100%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-ios-secondary">Delivered</span>
                    <span className="text-ios-dark font-medium">{stats.deliveredMessages.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-ios-gray rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${deliveryRate}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-ios-secondary">Read</span>
                    <span className="text-ios-dark font-medium">{stats.readMessages.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-ios-gray rounded-full overflow-hidden">
                    <div className="h-full bg-apple-purple rounded-full" style={{ width: `${openRate}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-ios-secondary">Failed</span>
                    <span className="text-ios-dark font-medium">{stats.failedMessages.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-ios-gray rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${(stats.failedMessages / stats.totalMessages * 100).toFixed(1)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Conversation Stats */}
            <div className="card-apple p-6">
              <h3 className="text-lg font-semibold text-ios-dark mb-4">Conversations</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-ios-gray rounded-apple-lg">
                  <p className="text-ios-muted text-sm">Total</p>
                  <p className="text-2xl font-bold text-ios-dark">{stats.conversationStats.total}</p>
                </div>
                <div className="p-4 bg-wa-green/10 rounded-apple-lg">
                  <p className="text-ios-muted text-sm">Open</p>
                  <p className="text-2xl font-bold text-wa-green">{stats.conversationStats.open}</p>
                </div>
                <div className="p-4 bg-ios-gray rounded-apple-lg">
                  <p className="text-ios-muted text-sm">Closed</p>
                  <p className="text-2xl font-bold text-ios-dark">{stats.conversationStats.closed}</p>
                </div>
                <div className="p-4 bg-apple-orange/10 rounded-apple-lg">
                  <p className="text-ios-muted text-sm">Pending</p>
                  <p className="text-2xl font-bold text-apple-orange">{stats.conversationStats.pending}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Insights Tab */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ios-muted text-sm">Messages Today</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">
                    {overview.messaging.sentToday.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-wa-green/10 rounded-apple-lg">
                  <Send className="w-6 h-6 text-wa-green" />
                </div>
              </div>
              <p className="text-sm text-ios-muted mt-2">
                {overview.messaging.sentThisWeek} this week
              </p>
            </div>

            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ios-muted text-sm">Total Contacts</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">
                    {overview.contacts.total.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-apple-purple/10 rounded-apple-lg">
                  <Users className="w-6 h-6 text-apple-purple" />
                </div>
              </div>
              <p className="text-sm text-ios-muted mt-2">
                {overview.contacts.optedIn} opted in ({overview.contacts.consentRate}%)
              </p>
            </div>

            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ios-muted text-sm">Open Conversations</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">
                    {overview.inbox.openConversations}
                  </p>
                </div>
                <div className="p-3 bg-apple-orange/10 rounded-apple-lg">
                  <MessageSquare className="w-6 h-6 text-apple-orange" />
                </div>
              </div>
              <p className="text-sm text-ios-muted mt-2">
                Avg response: {overview.inbox.avgResponseTime ? formatTime(overview.inbox.avgResponseTime) : '—'}
              </p>
            </div>

            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ios-muted text-sm">WhatsApp Phones</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">
                    {overview.whatsapp.connectedPhones}
                  </p>
                </div>
                <div className="p-3 bg-wa-green/10 rounded-apple-lg">
                  <BarChart3 className="w-6 h-6 text-wa-green" />
                </div>
              </div>
              <p className="text-sm text-ios-muted mt-2">
                Quality: {overview.whatsapp.qualityRatings.join(', ') || '—'}
              </p>
            </div>

            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ios-muted text-sm">Campaigns</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">
                    {overview.campaigns.total}
                  </p>
                </div>
                <div className="p-3 bg-blue-500/10 rounded-apple-lg">
                  <Target className="w-6 h-6 text-blue-500" />
                </div>
              </div>
              <p className="text-sm text-ios-muted mt-2">
                {overview.campaigns.thisMonth} this month
              </p>
            </div>

            <div className="card-apple p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ios-muted text-sm">Delivery Rate</p>
                  <p className="text-2xl font-bold text-ios-dark mt-1">
                    {overview.messaging.deliveryRate}%
                  </p>
                </div>
                <div className="p-3 bg-green-500/10 rounded-apple-lg">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                </div>
              </div>
              <p className="text-sm text-ios-muted mt-2">
                Read rate: {overview.messaging.readRate}%
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
