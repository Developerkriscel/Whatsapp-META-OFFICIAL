/**
 * Dashboard - Tenant analytics overview
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
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
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: statsData } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/dashboard/stats');
      return response.data;
    },
  });

  const { data: recentData } = useQuery({
    queryKey: ['dashboard-recent'],
    queryFn: async () => {
      const response = await api.get('/dashboard/recent');
      return response.data;
    },
  });

  const { data: chartData } = useQuery({
    queryKey: ['dashboard-chart'],
    queryFn: async () => {
      const response = await api.get('/dashboard/chart');
      return response.data;
    },
  });

  const stats = statsData?.data || {
    totalContacts: 0,
    activeContacts: 0,
    messagesSent: 0,
    messagesDelivered: 0,
    pendingMessages: 0,
    weeklyGrowth: 0,
  };

  const recentMessages = recentData?.data?.messages || [];

  const weeklyData = chartData?.data || [];

  const maxMessages = weeklyData.length > 0 ? Math.max(...weeklyData.map((d: { day: string; messages: number }) => d.messages || 0)) : 1;

  const quickLinks = [
    { label: 'New Campaign', desc: 'Send bulk messages', icon: Send, href: '/campaigns', color: 'wa-green' },
    { label: 'Contacts', desc: 'Manage your audience', icon: Users, href: '/contacts', color: 'wa-teal' },
    { label: 'Bot Flows', desc: 'Automate conversations', icon: Zap, href: '/bot-flows', color: 'wa-green' },
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
          { label: 'Total Contacts', value: stats.totalContacts.toLocaleString(), sub: `${stats.activeContacts} active`, icon: Users, color: 'wa-green', trend: '+8%' },
          { label: 'Messages Sent', value: stats.messagesSent.toLocaleString(), sub: `${((stats.messagesDelivered / stats.messagesSent) * 100).toFixed(1)}% delivered`, icon: Send, color: 'wa-teal', trend: '+12%' },
          { label: 'Active Now', value: '23', sub: 'conversations', icon: MessageSquare, color: 'wa-green', trend: '+5' },
          { label: 'Delivery Rate', value: `${((stats.messagesDelivered / stats.messagesSent) * 100).toFixed(1)}%`, sub: `${stats.pendingMessages} pending`, icon: CheckCircle, color: 'wa-teal', trend: '+0.3%' },
        ].map((stat) => (
          <div key={stat.label} className="card-apple p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2.5 bg-${stat.color}/20 text-${stat.color} rounded-apple-lg`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <span className={`text-xs font-medium flex items-center gap-0.5 ${
                stat.trend.startsWith('+') ? 'text-wa-green' : 'text-red-500'
              }`}>
                {stat.trend.startsWith('+') ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {stat.trend}
              </span>
            </div>
            <p className="text-2xl font-bold text-ios-dark">{stat.value}</p>
            <p className="text-sm text-ios-secondary">{stat.label}</p>
            <p className="text-xs text-ios-muted mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Chart */}
        <div className="col-span-2 card-apple p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-ios-dark">Message Volume</h2>
              <p className="text-sm text-ios-muted">Last 7 days</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 bg-wa-green rounded-full" />
              <span className="text-ios-secondary">Messages sent</span>
            </div>
          </div>

          <div className="flex items-end gap-3 h-40">
            {weeklyData.map((d: { day: string; messages: number }) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs text-ios-muted font-medium">{d.messages}</span>
                <div
                  className="w-full bg-gradient-to-t from-wa-green/60 to-wa-green rounded-t-lg transition-all hover:from-wa-green/80 hover:to-wa-green"
                  style={{ height: `${(d.messages / maxMessages) * 100}%`, minHeight: '8px' }}
                />
                <span className="text-xs text-ios-muted">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card-apple p-6">
          <h2 className="text-lg font-semibold text-ios-dark mb-4">Quick Actions</h2>
          <div className="space-y-3">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="flex items-center gap-3 p-3 border border-black/5 rounded-apple-lg hover:bg-ios-gray/50 transition group"
              >
                <div className={`w-10 h-10 bg-${link.color}/20 text-${link.color} rounded-apple-lg flex items-center justify-center group-hover:scale-105 transition`}>
                  <link.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium text-ios-dark text-sm">{link.label}</p>
                  <p className="text-xs text-ios-muted">{link.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Messages */}
      <div className="card-apple">
        <div className="p-4 border-b border-black/5 flex items-center justify-between">
          <h2 className="font-semibold text-ios-dark">Recent Conversations</h2>
          <Link to="/conversations" className="text-sm text-wa-green hover:underline">
            View all
          </Link>
        </div>
        <div className="divide-y divide-black/5">
          {recentMessages.map((msg: { id: string; contact: { name: string; phone: string }; preview: string; time: string; status: string }) => (
            <Link
              key={msg.id}
              to={`/conversations/${msg.contact.phone}`}
              className="flex items-center gap-4 p-4 hover:bg-ios-gray/50 transition"
            >
              <div className="w-12 h-12 bg-wa-green/20 text-wa-green rounded-full flex items-center justify-center font-semibold text-lg flex-shrink-0">
                {msg.contact.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ios-dark">{msg.contact.name}</p>
                  <span className="text-xs text-ios-muted">{msg.time}</span>
                </div>
                <p className="text-sm text-ios-secondary truncate mt-0.5">{msg.preview}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {msg.status === 'read' && (
                  <span className="text-xs text-wa-green">Read</span>
                )}
                {msg.status === 'delivered' && (
                  <CheckCircle className="w-4 h-4 text-wa-green" />
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
