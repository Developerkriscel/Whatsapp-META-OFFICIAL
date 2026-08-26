/**
 * Dashboard - Tenant analytics overview
 */

import { useQuery } from '@tanstack/react-query';
import { insightsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  MessageSquare,
  Send,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  BarChart3,
  Phone,
  AlertTriangle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { user } = useAuth();

  // Fetch insights overview
  const { data: insightsData, isLoading } = useQuery({
    queryKey: ['insights-overview'],
    queryFn: async () => {
      const response = await insightsApi.overview();
      return response.data.data;
    },
  });

  // Fetch WhatsApp health
  const { data: whatsappData } = useQuery({
    queryKey: ['insights-whatsapp'],
    queryFn: async () => {
      const response = await insightsApi.whatsapp();
      return response.data.data;
    },
  });

  // Use insights data
  const overview = insightsData || {
    messaging: { totalSent: 0, sentToday: 0, sentThisWeek: 0, sentThisMonth: 0, deliveryRate: 0, readRate: 0 },
    contacts: { total: 0, optedIn: 0, optedOut: 0, consentRate: 0 },
    campaigns: { total: 0, thisMonth: 0 },
    inbox: { openConversations: 0 },
    whatsapp: { connectedPhones: 0, qualityRatings: [] },
  };

  const whatsappHealth = whatsappData || {
    connectedPhones: 0,
    qualityRatings: [],
    webhookFailureRate: 0,
  };

  const quickLinks = [
    { label: 'New Campaign', desc: 'Send bulk messages', icon: Send, href: '/campaigns', color: 'wa-green' },
    { label: 'Contacts', desc: 'Manage your audience', icon: Users, href: '/contacts', color: 'wa-teal' },
    { label: 'Bot Flows', desc: 'Automate conversations', icon: Zap, href: '/flows', color: 'wa-green' },
    { label: 'Analytics', desc: 'View detailed stats', icon: BarChart3, href: '/analytics', color: 'wa-teal' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-wa">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-ios-secondary mt-1">Here's what's happening today</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-wa-teal font-medium">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Contacts', value: overview.contacts.total.toLocaleString(), icon: Users, trend: null, color: 'text-wa-green' },
          { label: 'Messages Sent', value: overview.messaging.totalSent.toLocaleString(), icon: MessageSquare, trend: null, color: 'text-wa-teal' },
          { label: 'Open Conversations', value: overview.inbox.openConversations.toLocaleString(), icon: Clock, trend: null, color: 'text-apple-purple' },
          { label: 'Campaigns', value: overview.campaigns.total.toLocaleString(), icon: Send, trend: null, color: 'text-wa-green' },
        ].map((stat, i) => (
          <div key={i} className="card-apple p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-ios-muted text-sm">{stat.label}</span>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-ios-dark">{isLoading ? '-' : stat.value}</p>
          </div>
        ))}
      </div>

      {/* WhatsApp Health Alert */}
      {whatsappHealth.qualityRatings?.includes('RED') && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <div>
            <p className="font-medium text-red-700">WhatsApp Quality Warning</p>
            <p className="text-sm text-red-600">One or more phone numbers have a poor quality rating. This may affect message delivery.</p>
          </div>
          <Link to="/whatsapp" className="ml-auto text-sm text-red-700 hover:text-red-800 font-medium">
            View Details →
          </Link>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-4">
        {quickLinks.map((link, i) => (
          <Link key={i} to={link.href} className={`card-apple p-4 hover:border-wa-${link.color} transition cursor-pointer`}>
            <link.icon className={`w-6 h-6 text-wa-${link.color} mb-2`} />
            <p className="font-medium text-ios-dark">{link.label}</p>
            <p className="text-xs text-ios-muted">{link.desc}</p>
          </Link>
        ))}
      </div>

      {/* Messaging Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-apple p-4">
          <h3 className="font-medium text-ios-dark mb-3">Delivery Rate</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-ios-gray rounded-full overflow-hidden">
              <div className="h-full bg-wa-green rounded-full" style={{ width: `${overview.messaging.deliveryRate}%` }} />
            </div>
            <span className="text-sm font-medium text-wa-green">{overview.messaging.deliveryRate}%</span>
          </div>
        </div>
        <div className="card-apple p-4">
          <h3 className="font-medium text-ios-dark mb-3">Read Rate</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-ios-gray rounded-full overflow-hidden">
              <div className="h-full bg-wa-teal rounded-full" style={{ width: `${overview.messaging.readRate}%` }} />
            </div>
            <span className="text-sm font-medium text-wa-teal">{overview.messaging.readRate}%</span>
          </div>
        </div>
        <div className="card-apple p-4">
          <h3 className="font-medium text-ios-dark mb-3">WhatsApp Numbers</h3>
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-wa-green" />
            <span className="text-2xl font-bold text-ios-dark">{overview.whatsapp.connectedPhones}</span>
            <span className="text-sm text-ios-muted">connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}
