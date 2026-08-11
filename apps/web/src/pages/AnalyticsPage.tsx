/**
 * Analytics Page - WhatsApp Business Analytics
 * Message delivery rates, open rates, response rates, revenue tracking
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  TrendingUp, TrendingDown, MessageSquare, Users, Send, Clock, CheckCircle,
  Eye, BarChart3, Download, Calendar, Filter, RefreshCw, AlertCircle,
  DollarSign, Target, Zap, ArrowUpRight, ArrowDownRight, Loader2, FileText
} from 'lucide-react';

type Period = '7d' | '30d' | '90d' | 'custom';
type ExportFormat = 'csv' | 'pdf' | 'json';

interface DateRange {
  start: string;
  end: string;
}

interface AnalyticsData {
  totalMessages: number;
  sentMessages: number;
  deliveredMessages: number;
  readMessages: number;
  failedMessages: number;
  activeContacts: number;
  newContacts: number;
  avgResponseTime: number;
  responseRate: number;
  totalRevenue: number;
  revenuePerMessage: number;
  topTemplate: string;
  topCampaign: string;
  conversationStats: {
    total: number;
    open: number;
    closed: number;
    pending: number;
  };
  dailyStats: DailyStat[];
  campaignStats: CampaignStat[];
}

interface DailyStat {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  responses: number;
}

interface CampaignStat {
  id: string;
  name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  ctr: number;
  revenue: number;
  status: string;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [isExporting, setIsExporting] = useState(false);

  // Fetch analytics overview
  const { data, isLoading, refetch } = useQuery({
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

  // Fetch detailed metrics
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

  // Fetch campaign analytics
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

  // Fetch revenue analytics
  const { data: revenueData } = useQuery({
    queryKey: ['analytics-revenue', period, dateRange],
    queryFn: async () => {
      const params: any = { period };
      if (period === 'custom') {
        params.start = dateRange.start;
        params.end = dateRange.end;
      }
      const response = await api.get('/analytics/revenue', { params });
      return response.data;
    },
  });

  const stats = data?.data as AnalyticsData || {
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
  const revenue = revenueData?.data || { total: 0, byDay: [] };

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
  const failedRate = stats.totalMessages > 0
    ? ((stats.failedMessages / stats.totalMessages) * 100).toFixed(1)
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

  // Export handler
  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    try {
      const params: any = { period, format };
      if (period === 'custom') {
        params.start = dateRange.start;
        params.end = dateRange.end;
      }
      const response = await api.get('/analytics/export', {
        params,
        responseType: format === 'json' ? 'json' : 'blob',
      });

      // Create download link
      const blob = new Blob([format === 'json' ? JSON.stringify(response.data, null, 2) : response.data], {
        type: format === 'csv' ? 'text/csv' : format === 'pdf' ? 'application/pdf' : 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-report-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Chart max value helper
  const maxChartValue = (arr: DailyStat[], key: keyof DailyStat) => {
    return Math.max(...arr.map(d => Number(d[key]) || 0), 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-wa">Analytics</h1>
          <p className="text-ios-secondary mt-1">Track your WhatsApp business performance</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="btn-apple btn-apple-outline flex items-center gap-2"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <div className="relative">
            <button
              onClick={() => handleExport('csv')}
              disabled={isExporting}
              className="btn-apple btn-wa-green flex items-center gap-2"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Period Filters */}
      <div className="card-apple p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-ios-muted" />
            <span className="text-sm text-ios-secondary">Period:</span>
            <div className="flex gap-1">
              {(['7d', '30d', '90d', 'custom'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPeriod(p);
                    if (p !== 'custom') {
                      setDateRange({
                        start: new Date(Date.now() - (p === '7d' ? 7 : p === '30d' ? 30 : 90) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        end: new Date().toISOString().split('T')[0],
                      });
                    }
                  }}
                  className={`px-3 py-1.5 text-sm rounded-apple-lg transition ${
                    period === p
                      ? 'bg-wa-green text-white'
                      : 'bg-ios-gray text-ios-secondary hover:bg-ios-gray/80'
                  }`}
                >
                  {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : p === '90d' ? '90 Days' : 'Custom'}
                </button>
              ))}
            </div>
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="input-apple text-sm"
              />
              <span className="text-ios-muted">to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="input-apple text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Messages */}
        <div className="card-apple p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-apple-lg flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <span className="text-xs text-apple-green flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> +12%
            </span>
          </div>
          <p className="text-2xl font-bold text-ios-dark">{stats.totalMessages.toLocaleString()}</p>
          <p className="text-sm text-ios-muted">Total Messages</p>
        </div>

        {/* Delivery Rate */}
        <div className="card-apple p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-wa-teal/20 text-wa-teal rounded-apple-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5" />
            </div>
            <span className={`text-xs flex items-center gap-1 ${Number(deliveryRate) >= 95 ? 'text-apple-green' : 'text-apple-orange'}`}>
              {Number(deliveryRate) >= 95 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {deliveryRate}%
            </span>
          </div>
          <p className="text-2xl font-bold text-ios-dark">{deliveryRate}%</p>
          <p className="text-sm text-ios-muted">Delivery Rate</p>
        </div>

        {/* Open Rate */}
        <div className="card-apple p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-apple-purple/20 text-apple-purple rounded-apple-lg flex items-center justify-center">
              <Eye className="w-5 h-5" />
            </div>
            <span className={`text-xs flex items-center gap-1 ${Number(openRate) >= 70 ? 'text-apple-green' : 'text-apple-orange'}`}>
              {Number(openRate) >= 70 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {openRate}%
            </span>
          </div>
          <p className="text-2xl font-bold text-ios-dark">{openRate}%</p>
          <p className="text-sm text-ios-muted">Open Rate</p>
        </div>

        {/* Response Rate */}
        <div className="card-apple p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-apple-orange/20 text-apple-orange rounded-apple-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className={`text-xs flex items-center gap-1 ${Number(responseRate) >= 50 ? 'text-apple-green' : 'text-apple-orange'}`}>
              {Number(responseRate) >= 50 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {responseRate}%
            </span>
          </div>
          <p className="text-2xl font-bold text-ios-dark">{responseRate}%</p>
          <p className="text-sm text-ios-muted">Response Rate</p>
        </div>
      </div>

      {/* Revenue & Additional Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Revenue */}
        <div className="card-apple p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-apple-green/20 text-apple-green rounded-apple-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <Zap className="w-4 h-4 text-apple-green" />
          </div>
          <p className="text-2xl font-bold text-ios-dark">{formatCurrency(stats.totalRevenue)}</p>
          <p className="text-sm text-ios-muted">Revenue Generated</p>
        </div>

        {/* Revenue Per Message */}
        <div className="card-apple p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-wa-teal/20 text-wa-teal rounded-apple-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-ios-dark">{formatCurrency(stats.revenuePerMessage)}</p>
          <p className="text-sm text-ios-muted">Revenue/Message</p>
        </div>

        {/* Avg Response Time */}
        <div className="card-apple p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-apple-purple/20 text-apple-purple rounded-apple-lg flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-ios-dark">{formatTime(stats.avgResponseTime)}</p>
          <p className="text-sm text-ios-muted">Avg Response Time</p>
        </div>

        {/* Failed Rate */}
        <div className="card-apple p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-apple-red/20 text-apple-red rounded-apple-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className={`text-xs ${Number(failedRate) <= 5 ? 'text-apple-green' : 'text-apple-red'}`}>
              {Number(failedRate) <= 5 ? 'Healthy' : 'High'}
            </span>
          </div>
          <p className="text-2xl font-bold text-ios-dark">{failedRate}%</p>
          <p className="text-sm text-ios-muted">Failed Rate</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Volume Chart */}
        <div className="card-apple p-6">
          <h3 className="font-semibold text-ios-dark mb-4">Message Volume Trends</h3>
          {stats.dailyStats && stats.dailyStats.length > 0 ? (
            <div className="space-y-3">
              {stats.dailyStats.slice(-7).map((day: DailyStat) => (
                <div key={day.date} className="space-y-1">
                  <div className="flex justify-between text-xs text-ios-muted">
                    <span>{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span>{day.sent} sent</span>
                  </div>
                  <div className="h-6 bg-ios-gray rounded-full overflow-hidden flex">
                    <div
                      className="bg-wa-green h-full transition-all"
                      style={{ width: `${(day.sent / maxChartValue(stats.dailyStats.slice(-7), 'sent')) * 100}%` }}
                      title={`Sent: ${day.sent}`}
                    />
                    <div
                      className="bg-wa-teal h-full transition-all"
                      style={{ width: `${(day.delivered / maxChartValue(stats.dailyStats.slice(-7), 'sent')) * 100}%` }}
                      title={`Delivered: ${day.delivered}`}
                    />
                    <div
                      className="bg-apple-purple h-full transition-all"
                      style={{ width: `${(day.read / maxChartValue(stats.dailyStats.slice(-7), 'sent')) * 100}%` }}
                      title={`Read: ${day.read}`}
                    />
                  </div>
                </div>
              ))}
              <div className="flex gap-4 pt-2 text-xs text-ios-muted">
                <span className="flex items-center gap-1"><div className="w-3 h-3 bg-wa-green rounded" /> Sent</span>
                <span className="flex items-center gap-1"><div className="w-3 h-3 bg-wa-teal rounded" /> Delivered</span>
                <span className="flex items-center gap-1"><div className="w-3 h-3 bg-apple-purple rounded" /> Read</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-ios-muted mx-auto mb-3 opacity-50" />
              <p className="text-ios-secondary">No message data available</p>
              <p className="text-sm text-ios-muted">Start sending messages to see trends</p>
            </div>
          )}
        </div>

        {/* Conversation Stats */}
        <div className="card-apple p-6">
          <h3 className="font-semibold text-ios-dark mb-4">Conversation Status</h3>
          <div className="space-y-4">
            {[
              { label: 'Open', value: stats.conversationStats?.open || 0, color: 'bg-wa-green', icon: MessageSquare },
              { label: 'Pending', value: stats.conversationStats?.pending || 0, color: 'bg-apple-orange', icon: Clock },
              { label: 'Closed', value: stats.conversationStats?.closed || 0, color: 'bg-ios-gray', icon: CheckCircle },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${item.color}/20 rounded-apple-lg flex items-center justify-center`}>
                    <item.icon className={`w-5 h-5 ${item.color.replace('/20', '').replace('bg-', 'text-')}`} />
                  </div>
                  <span className="text-ios-dark">{item.label}</span>
                </div>
                <span className="text-xl font-bold text-ios-dark">{item.value.toLocaleString()}</span>
              </div>
            ))}
            <div className="pt-4 border-t border-black/5">
              <div className="flex justify-between text-sm">
                <span className="text-ios-muted">Total Conversations</span>
                <span className="font-bold text-ios-dark">{stats.conversationStats?.total || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Performance */}
      <div className="card-apple p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ios-dark">Campaign Performance</h3>
          <div className="flex items-center gap-2 text-xs text-ios-muted">
            <Target className="w-4 h-4" />
            <span>Top performing campaigns</span>
          </div>
        </div>
        {campaigns && campaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-black/5 text-left">
                  <th className="pb-3 text-sm font-medium text-ios-muted">Campaign</th>
                  <th className="pb-3 text-sm font-medium text-ios-muted">Status</th>
                  <th className="pb-3 text-sm font-medium text-ios-muted text-right">Sent</th>
                  <th className="pb-3 text-sm font-medium text-ios-muted text-right">Delivered</th>
                  <th className="pb-3 text-sm font-medium text-ios-muted text-right">Read</th>
                  <th className="pb-3 text-sm font-medium text-ios-muted text-right">CTR</th>
                  <th className="pb-3 text-sm font-medium text-ios-muted text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {campaigns.map((campaign: CampaignStat) => (
                  <tr key={campaign.id} className="hover:bg-ios-gray/30 transition">
                    <td className="py-3 text-ios-dark font-medium">{campaign.name}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        campaign.status === 'COMPLETED' ? 'bg-apple-green/20 text-apple-green' :
                        campaign.status === 'SENDING' ? 'bg-wa-green/20 text-wa-green' :
                        campaign.status === 'SCHEDULED' ? 'bg-apple-orange/20 text-apple-orange' :
                        'bg-ios-gray text-ios-muted'
                      }`}>
                        {campaign.status}
                      </span>
                    </td>
                    <td className="py-3 text-right text-ios-dark">{campaign.sent.toLocaleString()}</td>
                    <td className="py-3 text-right text-ios-dark">{campaign.delivered.toLocaleString()}</td>
                    <td className="py-3 text-right text-ios-dark">{campaign.read.toLocaleString()}</td>
                    <td className="py-3 text-right">
                      <span className={`font-medium ${
                        campaign.ctr >= 10 ? 'text-apple-green' :
                        campaign.ctr >= 5 ? 'text-apple-orange' : 'text-apple-red'
                      }`}>
                        {campaign.ctr.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 text-right text-ios-dark">{formatCurrency(campaign.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Target className="w-12 h-12 text-ios-muted mx-auto mb-3 opacity-50" />
            <p className="text-ios-secondary">No campaign data available</p>
            <p className="text-sm text-ios-muted">Create campaigns to track performance</p>
          </div>
        )}
      </div>

      {/* Top Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card-apple p-6">
          <h3 className="font-semibold text-ios-dark mb-4">Top Templates</h3>
          <div className="space-y-3">
            {[
              { name: stats.topTemplate || 'Welcome Message', uses: 1250, ctr: '12.4%' },
              { name: 'Order Confirmation', uses: 890, ctr: '8.7%' },
              { name: 'Shipping Update', uses: 756, ctr: '15.2%' },
              { name: 'Promotional Offer', uses: 432, ctr: '22.1%' },
            ].map((template, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-ios-gray/50 rounded-apple-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-wa-green/20 text-wa-green rounded-apple flex items-center justify-center font-bold text-sm">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-ios-dark font-medium">{template.name}</p>
                    <p className="text-xs text-ios-muted">{template.uses.toLocaleString()} uses</p>
                  </div>
                </div>
                <span className="text-sm font-medium text-apple-green">{template.ctr} CTR</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="card-apple p-6">
          <h3 className="font-semibold text-ios-dark mb-4">Quick Stats</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-ios-muted" />
                <span className="text-ios-secondary">Active Contacts</span>
              </div>
              <span className="font-bold text-ios-dark">{stats.activeContacts.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-ios-muted" />
                <span className="text-ios-secondary">New Contacts</span>
              </div>
              <span className="font-bold text-ios-dark">+{stats.newContacts.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-ios-muted" />
                <span className="text-ios-secondary">Avg. per Contact</span>
              </div>
              <span className="font-bold text-ios-dark">
                {stats.activeContacts > 0 ? (stats.totalMessages / stats.activeContacts).toFixed(1) : '0'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-ios-muted" />
                <span className="text-ios-secondary">Peak Hour</span>
              </div>
              <span className="font-bold text-ios-dark">2:00 PM</span>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Over Time */}
      {revenue.byDay && revenue.byDay.length > 0 && (
        <div className="card-apple p-6">
          <h3 className="font-semibold text-ios-dark mb-4">Revenue Over Time</h3>
          <div className="h-48 flex items-end gap-2">
            {revenue.byDay.slice(-14).map((day: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-gradient-to-t from-apple-green to-apple-green/60 rounded-t transition-all hover:from-apple-green/80"
                  style={{ height: `${Math.max((day.amount / Math.max(...revenue.byDay.map((d: any) => d.amount))) * 100, 5)}%` }}
                  title={formatCurrency(day.amount)}
                />
                <span className="text-xs text-ios-muted">
                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 text-sm">
            <span className="text-ios-muted">Total: {formatCurrency(revenue.total)}</span>
            <span className="text-ios-muted">Period: {period === 'custom' ? `${dateRange.start} to ${dateRange.end}` : period}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Missing icon import
function UserPlus(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </svg>
  );
}
