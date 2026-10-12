import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Pencil, RefreshCw, X } from 'lucide-react';
import { api } from '../api/client';

interface Plan {
  id: string;
  name: string;
  tier: string;
  monthlyPrice: number | string;
  annualPrice: number | string;
  description: string | null;
  sortOrder: number;
  isPublic: boolean;
  isActive: boolean;
  [key: string]: string | number | boolean | null;
}

const limitFields = [
  ['maxContacts', 'Contacts'],
  ['maxMessagesPerMonth', 'Messages per month'],
  ['maxPhoneNumbers', 'Phone numbers'],
  ['maxTeamMembers', 'Team members'],
  ['maxChatbotFlows', 'Chatbot flows'],
  ['maxCampaigns', 'Campaigns'],
  ['maxSegments', 'Segments'],
  ['maxContactsPerCampaign', 'Contacts per campaign'],
  ['maxTemplates', 'Templates'],
  ['maxAPIKeys', 'API keys'],
  ['maxCampaignsPerDay', 'Campaigns per day'],
  ['maxMessagesPerMinute', 'Messages per minute'],
  ['maxMessagesPerHour', 'Messages per hour'],
] as const;

const featureFields = [
  ['hasAnalytics', 'Analytics'],
  ['hasChatbotBuilder', 'Chatbot builder'],
  ['hasWhatsAppFlows', 'WhatsApp Flows'],
  ['hasAPI', 'API access'],
  ['hasAIChatbot', 'AI chatbot'],
  ['hasCustomBranding', 'Custom branding'],
  ['hasPrioritySupport', 'Priority support'],
  ['hasAdvancedAnalytics', 'Advanced analytics'],
  ['hasWhiteLabel', 'White label'],
  ['hasDripCampaigns', 'Drip campaigns'],
  ['hasABTesting', 'A/B testing'],
  ['hasContactImport', 'Contact import'],
  ['hasBulkExport', 'Bulk export'],
] as const;

type PlanForm = {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  description: string;
  sortOrder: string;
  isPublic: boolean;
  isActive: boolean;
} & Record<(typeof limitFields)[number][0], string>
  & Record<(typeof featureFields)[number][0], boolean>;

function toPlanForm(plan: Plan): PlanForm {
  const form: Record<string, string | boolean> = {
    name: plan.name,
    monthlyPrice: String(plan.monthlyPrice),
    annualPrice: String(plan.annualPrice),
    description: plan.description || '',
    sortOrder: String(plan.sortOrder),
    isPublic: plan.isPublic,
    isActive: plan.isActive,
  };
  for (const [key] of limitFields) form[key] = String(plan[key] ?? 0);
  for (const [key] of featureFields) form[key] = Boolean(plan[key]);
  return form as PlanForm;
}

function toPlanPayload(form: PlanForm) {
  const payload: Record<string, string | number | boolean> = {
    name: form.name.trim(),
    monthlyPrice: Number(form.monthlyPrice),
    annualPrice: Number(form.annualPrice),
    description: form.description.trim(),
    sortOrder: Number(form.sortOrder),
    isPublic: form.isPublic,
    isActive: form.isActive,
  };
  for (const [key] of limitFields) payload[key] = Number(form[key]);
  for (const [key] of featureFields) payload[key] = form[key];
  return payload;
}

export default function SuperAdminPlans() {
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm | null>(null);
  const [error, setError] = useState('');

  const plansQuery = useQuery<Plan[]>({
    queryKey: ['superadmin-plans'],
    queryFn: async () => (await api.get('/superadmin/plans')).data.data,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingPlan || !form) throw new Error('Select a plan before saving.');
      await api.patch(`/superadmin/plans/${editingPlan.id}`, toPlanPayload(form));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['superadmin-plans'] }),
        queryClient.invalidateQueries({ queryKey: ['public-plans'] }),
        queryClient.invalidateQueries({ queryKey: ['billing', 'plans'] }),
        queryClient.invalidateQueries({ queryKey: ['plans'] }),
      ]);
      setEditingPlan(null);
      setForm(null);
      setError('');
    },
    onError: (cause: any) => {
      setError(
        cause.response?.data?.error?.message ||
        cause.response?.data?.message ||
        cause.message ||
        'Could not save plan changes.',
      );
    },
  });

  const edit = (plan: Plan) => {
    setEditingPlan(plan);
    setForm(toPlanForm(plan));
    setError('');
  };

  const updateForm = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">Available Plans</h1>
          <p className="mt-1 text-ios-secondary">
            Manage plan pricing, limits, features, and customer availability.
          </p>
        </div>
        <button
          type="button"
          onClick={() => plansQuery.refetch()}
          disabled={plansQuery.isFetching}
          className="btn-apple btn-apple-outline inline-flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${plansQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {plansQuery.isLoading ? (
        <div className="card-apple flex items-center justify-center gap-2 p-10 text-ios-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading plans...
        </div>
      ) : plansQuery.isError ? (
        <div className="card-apple p-8 text-center">
          <p role="alert" className="text-sm text-apple-red">Could not load available plans.</p>
          <button onClick={() => plansQuery.refetch()} className="mt-3 text-sm text-wa-green hover:underline">
            Try again
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {(plansQuery.data || []).map((plan) => (
            <article key={plan.id} className="card-apple p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-ios-dark">{plan.name}</h2>
                    <span className="rounded-full bg-ios-gray px-2 py-0.5 text-xs text-ios-muted">
                      {plan.tier}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ios-secondary">
                    ${Number(plan.monthlyPrice).toLocaleString()} / month
                    <span className="mx-2 text-ios-muted">·</span>
                    ${Number(plan.annualPrice).toLocaleString()} / year
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => edit(plan)}
                  className="btn-apple btn-apple-outline inline-flex items-center gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Edit plan
                </button>
              </div>
              <p className="mt-3 min-h-5 text-sm text-ios-secondary">{plan.description || 'No description'}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className={`rounded-full px-2.5 py-1 ${plan.isActive ? 'bg-wa-green/10 text-wa-green' : 'bg-apple-red/10 text-apple-red'}`}>
                  {plan.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className={`rounded-full px-2.5 py-1 ${plan.isPublic ? 'bg-wa-green/10 text-wa-green' : 'bg-ios-gray text-ios-muted'}`}>
                  {plan.isPublic ? 'Visible to customers' : 'Hidden from customers'}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {editingPlan && form && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setError('');
              updateMutation.mutate();
            }}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-apple-xl border border-black/10 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-white p-4">
              <div>
                <h2 className="text-lg font-semibold text-ios-dark">Edit {editingPlan.name}</h2>
                <p className="text-xs text-ios-muted">Changes are applied to customer pricing and plan enforcement.</p>
              </div>
              <button
                type="button"
                onClick={() => { setEditingPlan(null); setForm(null); }}
                aria-label="Close"
                className="rounded-apple-lg p-2 hover:bg-ios-gray"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 p-5">
              <section>
                <h3 className="mb-3 text-sm font-semibold text-ios-dark">Plan details</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="text-sm text-ios-secondary">
                    Name
                    <input required value={form.name} onChange={(event) => updateForm('name', event.target.value)} className="input-apple mt-1 w-full" />
                  </label>
                  <label className="text-sm text-ios-secondary">
                    Display order
                    <input required type="number" value={form.sortOrder} onChange={(event) => updateForm('sortOrder', event.target.value)} className="input-apple mt-1 w-full" />
                  </label>
                  <label className="text-sm text-ios-secondary">
                    Monthly price
                    <input required type="number" min="0" step="0.01" value={form.monthlyPrice} onChange={(event) => updateForm('monthlyPrice', event.target.value)} className="input-apple mt-1 w-full" />
                  </label>
                  <label className="text-sm text-ios-secondary">
                    Annual price
                    <input required type="number" min="0" step="0.01" value={form.annualPrice} onChange={(event) => updateForm('annualPrice', event.target.value)} className="input-apple mt-1 w-full" />
                  </label>
                  <label className="text-sm text-ios-secondary sm:col-span-2">
                    Description
                    <textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} rows={2} className="input-apple mt-1 w-full" />
                  </label>
                </div>
              </section>

              <section>
                <h3 className="mb-1 text-sm font-semibold text-ios-dark">Customer availability</h3>
                <p className="mb-3 text-xs text-ios-muted">A plan must be both active and public to appear in customer pricing and plan-change options.</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {([
                    ['isActive', 'Active for subscriptions'],
                    ['isPublic', 'Visible in customer plan lists'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-apple-lg border border-black/10 p-3 text-sm text-ios-secondary">
                      <input type="checkbox" checked={form[key]} onChange={(event) => updateForm(key, event.target.checked)} className="accent-[#25D366]" />
                      {label}
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-ios-dark">Usage limits</h3>
                <p className="mb-3 text-xs text-ios-muted">Use -1 for unlimited on contacts, messages, phone numbers, team members, and message rate limits.</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {limitFields.map(([key, label]) => (
                    <label key={key} className="text-xs font-medium text-ios-secondary">
                      {label}
                      <input
                        required
                        type="number"
                        min={['maxContacts', 'maxMessagesPerMonth', 'maxPhoneNumbers', 'maxTeamMembers', 'maxMessagesPerMinute', 'maxMessagesPerHour'].includes(key) ? -1 : 0}
                        step="1"
                        value={form[key]}
                        onChange={(event) => updateForm(key, event.target.value)}
                        className="input-apple mt-1 w-full"
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-ios-dark">Included features</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {featureFields.map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-apple-lg border border-black/10 p-3 text-sm text-ios-secondary">
                      <input type="checkbox" checked={form[key]} onChange={(event) => updateForm(key, event.target.checked)} className="accent-[#25D366]" />
                      {form[key] && <Check className="h-3.5 w-3.5 text-wa-green" />}
                      {label}
                    </label>
                  ))}
                </div>
              </section>

              {error && <p role="alert" className="text-sm text-apple-red">{error}</p>}
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-black/10 bg-white p-4">
              <button
                type="button"
                onClick={() => { setEditingPlan(null); setForm(null); }}
                className="btn-apple btn-apple-outline"
              >
                Cancel
              </button>
              <button type="submit" disabled={updateMutation.isPending} className="btn-apple btn-wa-green disabled:opacity-50">
                {updateMutation.isPending ? 'Saving...' : 'Save plan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
