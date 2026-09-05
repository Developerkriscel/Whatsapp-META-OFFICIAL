/**
 * File storage settings.
 *
 * Uploads used to land on the server's own disk, which loses everything on a
 * move to a fresh box. This points them at Cloudflare R2 instead.
 *
 * The test button round-trips a real object — writes, reads it back, deletes
 * it. A token with read access but not write returns 200 on every check that
 * only reads, so "the keys work" is not the same claim as "uploads will work",
 * and only the round trip distinguishes them.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { HardDrive, Check, X, Loader2, ExternalLink } from 'lucide-react';

export default function SuperAdminStorageTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sa-storage'],
    queryFn: async () => (await api.get('/superadmin/storage')).data?.data,
  });

  const save = useMutation({
    mutationFn: async (body: any) => (await api.put('/superadmin/storage', body)).data,
    onSuccess: () => { setForm({}); setResult(null); qc.invalidateQueries({ queryKey: ['sa-storage'] }); },
  });

  const test = useMutation({
    mutationFn: async () => (await api.post('/superadmin/storage/test')).data?.data,
    onSuccess: (d) => setResult(d),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-wa-green" /></div>;
  }

  const cfg = data ?? {};
  const value = (k: string, fallback = '') => form[k] ?? cfg[k] ?? fallback;

  return (
    <div className="card-apple p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-ios-dark inline-flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-ios-muted" /> File storage
          </h3>
          <p className="text-xs text-ios-muted mt-1 max-w-xl">
            Profile photos and uploads are stored on Cloudflare R2. Secrets are encrypted before
            they are saved and never sent back to this screen.
          </p>
        </div>
        {cfg.configured && (
          <span className="text-xs px-2 py-1 rounded-full bg-wa-green/15 text-wa-green shrink-0">
            {cfg.serving}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="S3 API endpoint" hint="https://<account>.r2.cloudflarestorage.com">
          <input
            value={value('endpoint')}
            onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
            className="input-apple w-full text-sm font-mono"
          />
        </Field>
        <Field label="Bucket">
          <input
            value={value('bucket')}
            onChange={(e) => setForm({ ...form, bucket: e.target.value })}
            className="input-apple w-full text-sm font-mono"
          />
        </Field>
        <Field label="Access Key ID" hint={cfg.hasAccessKeyId ? 'stored — leave blank to keep it' : undefined}>
          <input
            type="password"
            placeholder={cfg.hasAccessKeyId ? '••••••••' : ''}
            onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
            className="input-apple w-full text-sm font-mono"
          />
        </Field>
        <Field label="Secret Access Key" hint={cfg.hasSecretAccessKey ? 'stored — leave blank to keep it' : undefined}>
          <input
            type="password"
            placeholder={cfg.hasSecretAccessKey ? '••••••••' : ''}
            onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })}
            className="input-apple w-full text-sm font-mono"
          />
        </Field>
        <Field
          label="Public URL (optional)"
          hint="a public bucket or custom domain; without one files are served through this API"
        >
          <input
            value={value('publicBaseUrl')}
            onChange={(e) => setForm({ ...form, publicBaseUrl: e.target.value })}
            placeholder="https://files.kriscelwa.online"
            className="input-apple w-full text-sm font-mono"
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => save.mutate(form)}
          disabled={Object.keys(form).length === 0 || save.isPending}
          className="btn-apple btn-wa-green text-sm disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => test.mutate()}
          disabled={!cfg.configured || test.isPending}
          className="btn-apple btn-apple-outline text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {test.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Write a test file
        </button>
      </div>

      {result && (
        <div className={`p-3 rounded-apple-lg text-sm flex items-start gap-2 ${
          result.ok ? 'bg-wa-green/10 text-wa-green' : 'bg-apple-red/10 text-apple-red'
        }`}>
          {result.ok ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <X className="w-4 h-4 mt-0.5 shrink-0" />}
          <div>
            <p>{result.detail}</p>
            {/* The specific failure worth naming, because reading works and
                writing does not, which looks like a bug rather than a scope. */}
            {!result.ok && /AccessDenied|403/.test(result.detail) && (
              <p className="mt-1 text-ios-secondary">
                Reading works, so the keys are valid — the token is missing write access. In
                Cloudflare, create an R2 API token with <strong>Object Read &amp; Write</strong> on
                this bucket and paste the new keys above.
                <a
                  href="https://dash.cloudflare.com/?to=/:account/r2/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 ml-1 underline"
                >
                  R2 API tokens <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ios-secondary mb-1">
        {label}{hint && <span className="text-ios-muted font-normal"> — {hint}</span>}
      </span>
      {children}
    </label>
  );
}
