import axios from 'axios';

const API_BASE = '/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send the httpOnly refresh-token cookie
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// When the access token expires mid-session, several requests can 401 in the same
// tick (e.g. a page firing multiple parallel GETs). Without de-duplication each one
// would kick off its own /auth/refresh call; sharing a single in-flight promise
// means concurrent 401s all wait on and retry with the same refreshed token.
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post('/api/v1/auth/refresh', {}, { withCredentials: true })
      .then((response) => {
        if (!response.data.success) throw new Error('Refresh failed');
        const accessToken = response.data.data.accessToken;
        localStorage.setItem('accessToken', accessToken);
        return accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = originalRequest.url?.includes('/auth/login');
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        const accessToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ============================================
// AUTOMATION API
// ============================================
export const automationApi = {
  // Bot Flows
  listFlows: () => api.get('/automation/flows'),
  getFlow: (flowId: string) => api.get(`/automation/flows/${flowId}`),
  createFlow: (data: any) => api.post('/automation/flows', data),
  updateFlow: (flowId: string, data: any) => api.put(`/automation/flows/${flowId}`, data),
  deleteFlow: (flowId: string) => api.delete(`/automation/flows/${flowId}`),
  activateFlow: (flowId: string) => api.post(`/automation/flows/${flowId}/activate`),
  deactivateFlow: (flowId: string) => api.post(`/automation/flows/${flowId}/deactivate`),

  // Templates
  listTemplates: () => api.get('/automation/templates'),
  cloneTemplate: (templateId: string) => api.post(`/automation/templates/${templateId}/clone`),

  // Executions
  listExecutions: (params?: { flowId?: string; page?: number; limit?: number }) =>
    api.get('/automation/executions', { params }),
  triggerFlow: (conversationId: string, keyword?: string) =>
    api.post('/automation/trigger', { conversationId, keyword }),
};

// ============================================
// TEAMS API
// ============================================
export const teamsApi = {
  // Teams CRUD
  list: () => api.get('/teams'),
  listTeams: () => api.get('/teams'),          // alias used by some pages
  get: (teamId: string) => api.get(`/teams/${teamId}`),
  create: (data: { name: string; description?: string; autoAssign?: boolean; color?: string }) =>
    api.post('/teams', data),
  update: (teamId: string, data: any) => api.put(`/teams/${teamId}`, data),
  delete: (teamId: string) => api.delete(`/teams/${teamId}`),

  // Members
  addMember: (teamId: string, userId: string) =>
    api.post(`/teams/${teamId}/members`, { userId }),
  removeMember: (teamId: string, userId: string) =>
    api.delete(`/teams/${teamId}/members/${userId}`),

  // Agents
  listAgents: (params?: { status?: string; teamId?: string }) =>
    api.get('/agents', { params }),
  updateAgentStatus: (agentId: string, status: string, awayUntil?: string) =>
    api.put(`/agents/${agentId}/status`, { status, awayUntil }),

  // Assignment — accepts object { userId?, teamId? }
  assignConversation: (
    conversationId: string,
    assignment: { userId?: string; teamId?: string }
  ) => api.post(`/conversations/${conversationId}/assign`, assignment),

  transferConversation: (conversationId: string, agentId: string, reason?: string) =>
    api.post(`/conversations/${conversationId}/transfer`, { agentId, reason }),

  // Stats
  getWorkload: () => api.get('/agents/workload'),
  getAgentStats: (agentId: string, period?: string) =>
    api.get(`/agents/${agentId}/stats`, { params: { period } }),
};

// ============================================
// INSIGHTS API — maps to /api/v1/insights/* routes
// ============================================
export const insightsApi = {
  overview: () => api.get('/insights/overview'),
  messaging: (period?: string) => api.get('/insights/messaging', { params: { period } }),
  campaigns: () => api.get('/insights/campaigns'),
  inbox: () => api.get('/insights/inbox'),
  whatsapp: () => api.get('/insights/whatsapp'),
  finance: () => api.get('/insights/finance'),

  // Billing
  billingStatus: () => api.get('/insights/billing/status'),
  checkContact: () => api.post('/insights/billing/check-contact'),
  checkMessage: () => api.post('/insights/billing/check-message'),
};

// ============================================
// MONITORING API (no auth needed)
// ============================================
export const monitoringApi = {
  health: () => axios.get('/health'),
  ready: () => axios.get('/api/ready'),
  live: () => axios.get('/api/live'),
  metrics: () => axios.get('/api/metrics'),
  detailed: () => axios.get('/api/health/detailed'),
};
