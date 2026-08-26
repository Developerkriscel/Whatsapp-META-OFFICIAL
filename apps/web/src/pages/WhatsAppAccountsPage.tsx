import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Building2, RefreshCw, ExternalLink, AlertTriangle, Loader2,
  CheckCircle, Globe, DollarSign, Users, ChevronRight,
} from 'lucide-react';

interface Waba {
  id: string;
  name: string;
  currency?: string;
  owner_business_info?: { id: string; name: string };
  on_behalf_of_business_info?: { id: string; name: string };
}

export default function WhatsAppAccountsPage() {
  const [activeTab, setActiveTab] = useState<'owned' | 'client'>('client');

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['whatsapp-accounts'],
    queryFn: async () => {
      const res = await api.get('/whatsapp/accounts');
      return res.data;
    },
  });

  const owned: Waba[] = data?.data?.owned || [];
  const client: Waba[] = data?.data?.client || [];
  const list = activeTab === 'owned' ? owned : client;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">WhatsApp Business Accounts</h1>
          <p className="text-ios-secondary mt-1">All WABAs connected to your Meta Business Manager</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-apple btn-apple-outline flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-apple p-4">
          <p className="text-sm text-ios-muted">Client WABAs</p>
          <p className="text-2xl font-bold text-ios-dark">{client.length}</p>
          <p className="text-xs text-ios-muted mt-1">Managed on behalf of clients</p>
        </div>
        <div className="card-apple p-4">
          <p className="text-sm text-ios-muted">Owned WABAs</p>
          <p className="text-2xl font-bold text-apple-green">{owned.length}</p>
          <p className="text-xs text-ios-muted mt-1">Directly owned by your business</p>
        </div>
        <div className="card-apple p-4">
          <p className="text-sm text-ios-muted">Total</p>
          <p className="text-2xl font-bold text-ios-dark">{client.length + owned.length}</p>
          <p className="text-xs text-ios-muted mt-1">All accessible accounts</p>
        </div>
      </div>

      {/* Not Configured Banner */}
      {error && (
        <div className="card-apple p-5 border-l-4 border-apple-orange flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-apple-orange shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-apple-orange">System User Token Not Configured</p>
            <p className="text-sm text-ios-secondary mt-1">
              Set <code className="bg-ios-gray px-1 rounded text-xs">WHATSAPP_SYSTEM_USER_TOKEN</code> and{' '}
              <code className="bg-ios-gray px-1 rounded text-xs">META_BUSINESS_ID</code> in your API environment to list all WABAs.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-black/10">
        <div className="flex gap-1">
          {[
            { id: 'client', label: `Client WABAs (${client.length})`, icon: Users },
            { id: 'owned', label: `Owned WABAs (${owned.length})`, icon: Building2 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'owned' | 'client')}
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

      {/* WABA List */}
      <div className="card-apple">
        <div className="p-4 border-b border-black/5 flex items-center justify-between">
          <h2 className="font-semibold text-ios-dark">
            {activeTab === 'client' ? 'Client WhatsApp Business Accounts' : 'Owned WhatsApp Business Accounts'}
          </h2>
          <span className="text-xs text-ios-muted">{list.length} account{list.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <div className="p-12 flex items-center justify-center gap-3 text-ios-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading accounts from Meta...</span>
          </div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-ios-muted mx-auto mb-4 opacity-50" />
            <p className="text-ios-secondary font-medium">No {activeTab} WABAs found</p>
            <p className="text-sm text-ios-muted mt-1">
              {activeTab === 'client'
                ? 'No client WhatsApp Business Accounts are shared with your Business Manager'
                : 'No WABAs are directly owned by your Business Manager'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-black/5">
            {list.map(waba => (
              <div key={waba.id} className="p-4 hover:bg-ios-gray/20 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 bg-wa-green/10 rounded-apple-xl flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-wa-green" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-ios-dark">{waba.name || 'Unnamed WABA'}</p>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                          activeTab === 'client'
                            ? 'bg-apple-blue/10 text-apple-blue'
                            : 'bg-apple-green/10 text-apple-green'
                        }`}>
                          {activeTab === 'client' ? 'Client' : 'Owned'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-ios-muted">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          <span className="font-mono">{waba.id}</span>
                        </span>
                        {waba.currency && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {waba.currency}
                          </span>
                        )}
                        {(waba.owner_business_info || waba.on_behalf_of_business_info) && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {(waba.owner_business_info || waba.on_behalf_of_business_info)?.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${waba.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-apple btn-apple-outline text-xs px-3 py-1.5 flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Manage in Meta
                    </a>
                    <a
                      href="/whatsapp"
                      className="btn-apple btn-wa-green text-xs px-3 py-1.5 flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Connect
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help */}
      <div className="card-apple p-5 bg-ios-gray/30">
        <p className="text-sm text-ios-secondary">
          <strong className="text-ios-dark">Tip:</strong> This list uses your platform's System User Token to fetch all WABAs associated with your Meta Business Manager.
          To connect a WABA to a tenant, go to{' '}
          <a href="/whatsapp" className="text-wa-green hover:underline font-medium">WhatsApp Settings</a>{' '}
          and click <strong>Connect with Facebook</strong>.
        </p>
      </div>
    </div>
  );
}
