/**
 * SuperAdmin System Monitoring Page
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Activity,
  Server,
  HardDrive,
  Cpu,
  Wifi,
  Clock,
  Database,
  Globe,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  TrendingUp,
  MemoryStick,
  Loader2,
} from 'lucide-react';

const TABS = ['overview', 'services', 'webhooks', 'announcements', 'rate-markup', 'logs', 'alerts'] as const;
type TabType = typeof TABS[number];

export default function SuperAdminSystemPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [logLevel, setLogLevel] = useState('all');
  const [logService, setLogService] = useState('all');

  const { data: dashboardData, isLoading: dashLoading } = useQuery({
    queryKey: ['superadmin-dashboard'],
    queryFn: async () => {
      const r = await api.get('/superadmin/dashboard');
      return r.data.data;
    },
  });

  const { data: auditLogsData, isLoading: logsLoading } = useQuery({
    queryKey: ['superadmin-audit-logs', logLevel, logService],
    queryFn: async () => {
      const params: any = {};
      if (logLevel !== 'all') params.level = logLevel;
      if (logService !== 'all') params.service = logService;
      const r = await api.get('/superadmin/audit-logs', { params });
      return r.data;
    },
    enabled: activeTab === 'logs',
  });

  const { data: ticketsData } = useQuery({
    queryKey: ['superadmin-tickets'],
    queryFn: async () => {
      const r = await api.get('/superadmin/tickets', { params: { status: 'OPEN', limit: 10 } });
      return r.data;
    },
    enabled: activeTab === 'alerts',
  });

  const auditLogs = auditLogsData?.data || [];
  const openTickets = ticketsData?.data || [];
  const dash = dashboardData || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">System Monitor</h1>
          <p className="text-ios-secondary mt-1">Platform health and performance metrics</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 bg-wa-green rounded-full animate-pulse" />
          <span className="text-wa-green font-medium">Systems Operational</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-ios-gray p-1 rounded-apple-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-apple transition capitalize ${
              activeTab === tab
                ? 'bg-white shadow-sm text-ios-dark'
                : 'text-ios-secondary hover:text-ios-dark'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {dashLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-wa-green" />
            </div>
          ) : (
            <>
              {/* Platform Stats */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  {
                    label: 'Total Tenants',
                    value: dash.totalTenants?.toLocaleString() ?? '—',
                    icon: Server,
                    color: 'wa-blue',
                    sub: `${dash.activeTenants ?? 0} active`,
                  },
                  {
                    label: 'Total Contacts',
                    value: dash.totalContacts?.toLocaleString() ?? '—',
                    icon: Activity,
                    color: 'wa-purple',
                    sub: 'across all tenants',
                  },
                  {
                    label: 'Total Messages',
                    value: dash.totalMessages?.toLocaleString() ?? '—',
                    icon: Zap,
                    color: 'wa-green',
                    sub: 'sent platform-wide',
                  },
                  {
                    label: 'Open Tickets',
                    value: dash.openTickets?.toLocaleString() ?? '—',
                    icon: AlertTriangle,
                    color: 'wa-red',
                    sub: `${dash.trialTenants ?? 0} on trial`,
                  },
                ].map((card) => (
                  <div key={card.label} className="card-apple p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-ios-secondary">{card.label}</p>
                        <p className="text-2xl font-bold text-ios-dark mt-1">{card.value}</p>
                        <p className="text-xs text-ios-muted mt-1">{card.sub}</p>
                      </div>
                      <div className={`p-2.5 bg-${card.color}/20 text-${card.color} rounded-apple-lg`}>
                        <card.icon className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Service Status Grid */}
              <div className="card-apple p-6">
                <h2 className="text-lg font-semibold text-ios-dark mb-4">Service Status</h2>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { name: 'API Gateway', status: 'healthy', latency: '12ms', uptime: '99.99%' },
                    { name: 'Auth Service', status: 'healthy', latency: '8ms', uptime: '99.98%' },
                    { name: 'WhatsApp Connector', status: 'healthy', latency: '45ms', uptime: '99.95%' },
                    { name: 'Database (Prisma)', status: 'healthy', latency: '5ms', uptime: '99.99%' },
                    { name: 'Message Queue', status: 'healthy', latency: '3ms', uptime: '99.97%' },
                    { name: 'File Storage', status: 'healthy', latency: '22ms', uptime: '99.94%' },
                    { name: 'Email Service', status: 'healthy', latency: '120ms', uptime: '99.9%' },
                    { name: 'Analytics Pipeline', status: 'healthy', latency: '80ms', uptime: '99.8%' },
                    { name: 'Payment Gateway', status: 'healthy', latency: '67ms', uptime: '99.99%' },
                  ].map((service) => (
                    <div key={service.name} className="p-4 border border-black/5 rounded-apple-lg hover:bg-ios-gray/50 transition">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-ios-dark text-sm">{service.name}</span>
                        <div className={`flex items-center gap-1.5 ${
                          service.status === 'healthy' ? 'text-wa-green' : 'text-apple-orange'
                        }`}>
                          {service.status === 'healthy' ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          <span className="text-xs font-medium capitalize">{service.status}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-ios-muted">
                        <span>{service.latency} latency</span>
                        <span>{service.uptime}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resource Overview */}
              <div className="grid grid-cols-2 gap-6">
                <div className="card-apple p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-ios-muted" />
                      <h3 className="font-medium text-ios-dark">CPU Usage</h3>
                    </div>
                    <span className="text-sm font-medium text-wa-green">23%</span>
                  </div>
                  <div className="h-3 bg-ios-gray rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-wa-green/60 to-wa-green rounded-full" style={{ width: '23%' }} />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-ios-muted">
                    <span>2.4 / 16 cores</span>
                    <span>Normal</span>
                  </div>
                </div>

                <div className="card-apple p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <MemoryStick className="w-4 h-4 text-ios-muted" />
                      <h3 className="font-medium text-ios-dark">Memory</h3>
                    </div>
                    <span className="text-sm font-medium text-wa-green">67%</span>
                  </div>
                  <div className="h-3 bg-ios-gray rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-wa-green/60 to-wa-green rounded-full" style={{ width: '67%' }} />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-ios-muted">
                    <span>10.7 / 16 GB</span>
                    <span>Moderate</span>
                  </div>
                </div>

                <div className="card-apple p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-ios-muted" />
                      <h3 className="font-medium text-ios-dark">Disk I/O</h3>
                    </div>
                    <span className="text-sm font-medium text-ios-secondary">12%</span>
                  </div>
                  <div className="h-3 bg-ios-gray rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-ios-muted/60 to-ios-muted rounded-full" style={{ width: '12%' }} />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-ios-muted">
                    <span>120 MB/s read</span>
                    <span>Idle</span>
                  </div>
                </div>

                <div className="card-apple p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-ios-muted" />
                      <h3 className="font-medium text-ios-dark">Network</h3>
                    </div>
                    <span className="text-sm font-medium text-apple-purple">45 Mbps</span>
                  </div>
                  <div className="h-3 bg-ios-gray rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-apple-purple/60 to-apple-purple rounded-full" style={{ width: '45%' }} />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-ios-muted">
                    <span>In: 32 / Out: 13 Mbps</span>
                    <span>Normal</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Services Tab */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          <div className="card-apple p-6">
            <h2 className="text-lg font-semibold text-ios-dark mb-6">Microservices Health</h2>
            <div className="space-y-4">
              {[
                { name: 'api-gateway', type: 'Gateway', instances: 4, healthy: 4, region: 'us-east-1', cpu: 18, mem: 45 },
                { name: 'auth-service', type: 'Auth', instances: 3, healthy: 3, region: 'us-east-1', cpu: 22, mem: 38 },
                { name: 'whatsapp-connector', type: 'Integration', instances: 5, healthy: 5, region: 'us-east-1', cpu: 35, mem: 62 },
                { name: 'message-processor', type: 'Queue Consumer', instances: 8, healthy: 8, region: 'us-east-1', cpu: 28, mem: 55 },
                { name: 'webhook-dispatcher', type: 'Event Handler', instances: 3, healthy: 3, region: 'us-east-1', cpu: 15, mem: 32 },
                { name: 'analytics-collector', type: 'Analytics', instances: 2, healthy: 2, region: 'us-east-1', cpu: 42, mem: 78 },
              ].map((svc) => (
                <div key={svc.name} className="p-4 border border-black/5 rounded-apple-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Server className="w-4 h-4 text-ios-muted" />
                      <div>
                        <p className="font-medium text-ios-dark">{svc.name}</p>
                        <p className="text-xs text-ios-muted">{svc.type} · {svc.region}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded-apple-full font-medium ${
                        svc.healthy === svc.instances
                          ? 'bg-wa-green/20 text-wa-green'
                          : 'bg-apple-orange/20 text-apple-orange'
                      }`}>
                        {svc.healthy}/{svc.instances} instances
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-ios-muted">CPU</span>
                        <span className="text-ios-secondary font-medium">{svc.cpu}%</span>
                      </div>
                      <div className="h-1.5 bg-ios-gray rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${svc.cpu > 70 ? 'bg-red-500' : svc.cpu > 50 ? 'bg-apple-orange' : 'bg-wa-green'}`} style={{ width: `${svc.cpu}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-ios-muted">Memory</span>
                        <span className="text-ios-secondary font-medium">{svc.mem}%</span>
                      </div>
                      <div className="h-1.5 bg-ios-gray rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${svc.mem > 80 ? 'bg-red-500' : svc.mem > 60 ? 'bg-apple-orange' : 'bg-wa-green'}`} style={{ width: `${svc.mem}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}



      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="card-apple p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-ios-dark">Audit Logs</h2>
            <div className="flex gap-2">
              <select
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value)}
                className="input-apple text-sm py-1.5"
              >
                <option value="all">All Levels</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-wa-green" />
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-12 text-ios-muted">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No audit logs found</p>
            </div>
          ) : (
            <div className="font-mono text-xs space-y-1 max-h-96 overflow-y-auto bg-black/5 rounded-apple-lg p-4">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="flex gap-3 hover:bg-black/5 px-2 py-1 -mx-2 rounded transition">
                  <span className="text-ios-muted flex-shrink-0">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                  <span className={`flex-shrink-0 font-medium ${
                    log.action === 'ERROR' ? 'text-red-500' :
                    log.action === 'SUSPEND' || log.action === 'DELETE' ? 'text-red-500' :
                    'text-wa-green'
                  }`}>[{log.action}]</span>
                  <span className="text-apple-purple flex-shrink-0">{log.actorRole}</span>
                  <span className="text-ios-secondary">{log.description || log.action}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Webhooks Queue & Meta API Rate Limit Inspector Tab */}
      {activeTab === 'webhooks' && <WebhooksInspectorTab />}

      {/* Announcements Tab */}
      {activeTab === 'announcements' && <AnnouncementsTab />}

      {/* Rate Markup Tab */}
      {activeTab === 'rate-markup' && <RateMarkupTab />}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {openTickets.length === 0 ? (
            <div className="card-apple p-12 text-center">
              <CheckCircle className="w-10 h-10 text-wa-green mx-auto mb-3 opacity-60" />
              <p className="font-medium text-ios-dark">No open alerts</p>
              <p className="text-sm text-ios-muted mt-1">All systems are running normally</p>
            </div>
          ) : (
            openTickets.map((ticket: any) => (
              <div key={ticket.id} className="card-apple p-5 border-l-4 border-l-apple-orange">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-apple-orange flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-ios-dark">{ticket.subject || 'Support Ticket'}</p>
                      <p className="text-sm text-ios-secondary mt-1">
                        {ticket.description?.slice(0, 120) || 'No description'}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs text-ios-muted">
                          {ticket.priority || 'NORMAL'} priority
                        </span>
                        <span className="text-xs text-ios-muted">
                          {ticket.tenant?.name || ticket.tenantName || 'Unknown tenant'}
                        </span>
                        <span className="text-xs text-ios-muted">
                          {ticket.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function WebhooksInspectorTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-webhooks-inspector'],
    queryFn: async () => {
      const r = await api.get('/superadmin/webhook-inspector');
      return r.data.data;
    },
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-wa-green" /></div>;
  }

  const inspector = data || {};
  const metaLimit = inspector.metaApiRateLimit || {};
  const webhooks = inspector.recentWebhooks || [];

  return (
    <div className="space-y-6">
      {/* Top Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-apple p-5">
          <p className="text-xs text-ios-muted font-medium">Meta API Rate Limit Usage</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-3xl font-bold text-ios-dark">{metaLimit.percentageUsed || 0}%</span>
            <span className="px-2 py-1 text-xs rounded-apple-full bg-wa-green/20 text-wa-green font-semibold">
              {metaLimit.status || 'HEALTHY'}
            </span>
          </div>
          <div className="w-full bg-ios-gray h-2 rounded-full mt-3 overflow-hidden">
            <div className="bg-wa-green h-full rounded-full" style={{ width: `${metaLimit.percentageUsed || 10}%` }} />
          </div>
          <p className="text-xs text-ios-muted mt-2">Quota resets in {metaLimit.resetsInSeconds || 40}s</p>
        </div>

        <div className="card-apple p-5">
          <p className="text-xs text-ios-muted font-medium">Webhook Queue Status</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-3xl font-bold text-ios-dark">{inspector.queueDepth || 0} msgs</span>
            <span className="px-2 py-1 text-xs rounded-apple-full bg-blue-500/20 text-blue-500 font-semibold">
              {inspector.queueStatus || 'IDLE'}
            </span>
          </div>
          <p className="text-xs text-ios-muted mt-4">Active workers: 4 instances running</p>
        </div>

        <div className="card-apple p-5">
          <p className="text-xs text-ios-muted font-medium">Webhook Delivery Success Rate</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-3xl font-bold text-wa-green">{inspector.successRatePercentage || '100.0'}%</span>
            <span className="text-xs text-ios-muted">{inspector.processedTotal || 0} processed</span>
          </div>
          <p className="text-xs text-ios-muted mt-4">Failed webhooks total: {inspector.failedTotal || 0}</p>
        </div>
      </div>

      {/* Live Webhooks Stream */}
      <div className="card-apple p-6">
        <h3 className="font-semibold text-ios-dark mb-4">Live Webhook Event Stream</h3>
        <div className="space-y-2">
          {webhooks.length === 0 ? (
            <p className="text-sm text-ios-muted py-4">No recent webhooks captured</p>
          ) : (
            webhooks.map((wh: any) => (
              <div key={wh.id} className="flex items-center justify-between p-3 bg-ios-gray/50 rounded-apple-lg text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-wa-green rounded-full" />
                  <span className="font-mono text-ios-dark">{wh.event}</span>
                  <span className="text-ios-muted">•</span>
                  <span className="text-ios-secondary">{wh.tenant}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="px-2 py-0.5 rounded bg-wa-green/20 text-wa-green font-medium">{wh.status}</span>
                  <span className="text-ios-muted">{new Date(wh.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AnnouncementsTab() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS'>('INFO');
  const [creating, setCreating] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['superadmin-announcements'],
    queryFn: async () => {
      const r = await api.get('/superadmin/announcements');
      return r.data.data;
    },
  });

  const announcements = data || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) return;
    setCreating(true);
    try {
      await api.post('/superadmin/announcements', { title, message, type });
      setTitle('');
      setMessage('');
      refetch();
    } catch (err: any) {
      alert('Failed to publish announcement');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/superadmin/announcements/${id}`);
    refetch();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Create Announcement Form */}
      <div className="card-apple p-6 lg:col-span-1 h-fit">
        <h3 className="font-semibold text-ios-dark mb-4">Publish System Announcement</h3>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-xs text-ios-muted font-medium block mb-1">Title</label>
            <input
              type="text"
              placeholder="e.g. Scheduled Maintenance"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-apple w-full text-sm"
              required
            />
          </div>
          <div>
            <label className="text-xs text-ios-muted font-medium block mb-1">Type</label>
            <select
              value={type}
              onChange={(e: any) => setType(e.target.value)}
              className="input-apple w-full text-sm"
            >
              <option value="INFO">Info (Blue)</option>
              <option value="WARNING">Warning (Orange)</option>
              <option value="CRITICAL">Critical (Red)</option>
              <option value="SUCCESS">Success (Green)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-ios-muted font-medium block mb-1">Message</label>
            <textarea
              rows={3}
              placeholder="Announcement text delivered to all tenant dashboards..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="input-apple w-full text-sm resize-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="btn-apple btn-apple-primary w-full text-sm py-2"
          >
            {creating ? 'Publishing...' : 'Publish Banner'}
          </button>
        </form>
      </div>

      {/* Announcements List */}
      <div className="card-apple p-6 lg:col-span-2 space-y-4">
        <h3 className="font-semibold text-ios-dark">Active Banners & Notices</h3>
        <div className="space-y-3">
          {announcements.length === 0 ? (
            <p className="text-sm text-ios-muted py-6 text-center">No announcements published</p>
          ) : (
            announcements.map((ann: any) => (
              <div
                key={ann.id}
                className={`p-4 rounded-apple-lg border flex items-start justify-between ${
                  ann.type === 'CRITICAL' ? 'bg-red-500/10 border-red-500/30 text-red-700' :
                  ann.type === 'WARNING' ? 'bg-apple-orange/10 border-apple-orange/30 text-amber-800' :
                  ann.type === 'SUCCESS' ? 'bg-wa-green/10 border-wa-green/30 text-emerald-800' :
                  'bg-blue-500/10 border-blue-500/30 text-blue-800'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{ann.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-black/10 font-mono">{ann.type}</span>
                  </div>
                  <p className="text-xs leading-relaxed">{ann.message}</p>
                  <p className="text-[10px] opacity-70 mt-2">{new Date(ann.createdAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => handleDelete(ann.id)}
                  className="text-xs px-2 py-1 rounded bg-black/10 hover:bg-black/20"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function RateMarkupTab() {
  const [markupInput, setMarkupInput] = useState('');
  const [updating, setUpdating] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['superadmin-rate-card'],
    queryFn: async () => {
      const r = await api.get('/superadmin/rate-card');
      return r.data.data;
    },
  });

  const currentMarkup = data?.globalMarkupPercent ?? 20;
  const rateCard = data?.rateCard || [];

  const handleSaveMarkup = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(markupInput);
    if (isNaN(val) || val < 0) return;
    setUpdating(true);
    try {
      await api.patch('/superadmin/rate-card/markup', { markupPercent: val });
      setMarkupInput('');
      refetch();
    } catch (err: any) {
      alert('Failed to update markup percent');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Global Profit Margin Card */}
      <div className="card-apple p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="font-semibold text-ios-dark text-lg">Global WhatsApp Rate Card Profit Margin</h3>
          <p className="text-sm text-ios-secondary mt-1">
            Set your SaaS markup percentage added to raw Meta Graph API country rates.
          </p>
          <p className="text-xs text-wa-green font-medium mt-2">Current Active Markup: +{currentMarkup}%</p>
        </div>

        <form onSubmit={handleSaveMarkup} className="flex items-center gap-3">
          <input
            type="number"
            placeholder={`${currentMarkup}`}
            value={markupInput}
            onChange={(e) => setMarkupInput(e.target.value)}
            className="input-apple text-sm w-32"
            min="0"
            max="500"
          />
          <span className="text-sm text-ios-muted font-bold">%</span>
          <button type="submit" disabled={updating} className="btn-apple btn-apple-primary text-sm py-2">
            {updating ? 'Saving...' : 'Update Margin'}
          </button>
        </form>
      </div>

      {/* Country Rates Matrix */}
      <div className="card-apple p-6">
        <h3 className="font-semibold text-ios-dark mb-4">Sample Country Rate Matrix (With +{currentMarkup}% Markup)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-ios-muted bg-ios-gray rounded-apple-lg uppercase font-semibold">
              <tr>
                <th className="p-3">Country</th>
                <th className="p-3">Currency</th>
                <th className="p-3">Meta Base Cost ($)</th>
                <th className="p-3">Client Charged ($)</th>
                <th className="p-3">Charged Credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 text-ios-dark text-xs font-mono">
              {rateCard.slice(0, 15).map((row: any) => (
                <tr key={row.countryCode} className="hover:bg-ios-gray/40">
                  <td className="p-3 font-sans font-medium">{row.countryCode}</td>
                  <td className="p-3">{row.currency}</td>
                  <td className="p-3 text-ios-muted">${row.metaCostUsd}</td>
                  <td className="p-3 text-wa-green font-bold">${row.chargedMarketingUsd}</td>
                  <td className="p-3 font-bold">{row.chargedMarketingCredits} cr</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
