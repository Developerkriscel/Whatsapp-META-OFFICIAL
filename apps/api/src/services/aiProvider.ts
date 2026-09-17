/**
 * Which model answers, and with whose key.
 *
 * Every AI call in the product went straight to Mistral with a key read from
 * the environment, so choosing a provider meant editing .env and redeploying,
 * and there was no way to run OpenAI at all. Provider, keys and model names are
 * now platform settings, changed from the panel like every other operational
 * setting here.
 *
 * Both vendors speak the same /v1/chat/completions shape, so the abstraction is
 * thin on purpose: a base URL, a key and a model name. What it does add is the
 * two things that actually bite —
 *
 *  - Newer OpenAI models reject `max_tokens` (they want `max_completion_tokens`)
 *    and reject any `temperature` other than the default. A call built for one
 *    generation 400s against the other, which would surface as "AI is off"
 *    rather than as a bug. Rather than hardcode which model wants which, the
 *    first rejection is read and the call retried in the other shape, and the
 *    working shape is remembered per model.
 *
 *  - Embeddings are not interchangeable. mistral-embed returns 1024 dimensions,
 *    text-embedding-3-small returns 1536, and cosine similarity between vectors
 *    of different length is meaningless -- our own implementation returns 0. So
 *    a provider switch would leave every stored chunk scoring zero and the bot
 *    answering "I don't know" to everything, with nothing logged. The expected
 *    dimension is exposed so callers can detect stale chunks instead.
 */
import type { PrismaClient } from '@prisma/client';
import { encryptSecret, decryptIfPresent } from './credentialEncryption.js';

export type Provider = 'mistral' | 'openai';

interface ProviderSpec {
  label: string;
  baseUrl: string;
  defaultChatModel: string;
  defaultEmbedModel: string;
  embedDimensions: number;
  keySetting: string;
  chatModelSetting: string;
  /** Where to send someone to create a key, shown in the panel. */
  keysUrl: string;
  /** Read from the environment when nothing is stored, so existing deployments keep working. */
  envKey: string;
}

export const PROVIDERS: Record<Provider, ProviderSpec> = {
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultChatModel: 'mistral-small-latest',
    defaultEmbedModel: 'mistral-embed',
    embedDimensions: 1024,
    keySetting: 'mistral_api_key',
    chatModelSetting: 'mistral_chat_model',
    keysUrl: 'https://console.mistral.ai/api-keys',
    envKey: 'MISTRAL_API_KEY',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    /**
     * Chosen by measurement, not by generation number.
     *
     * On the template-rewrite prompt this product actually sends, gpt-5-mini
     * spent all 500 completion tokens on reasoning and returned an empty
     * string -- silently, with HTTP 200. Forcing reasoning_effort to minimal
     * made it answer, but both gpt-5-mini and gpt-5-nano then left the body
     * starting and ending with a variable, which is the exact defect they were
     * asked to fix. gpt-4.1-mini produced the best rewrite, in 798ms against
     * 2198ms, and being a non-reasoning model its token budget means what it
     * says. Cheaper and better here; changeable from the panel.
     */
    defaultChatModel: 'gpt-4.1-mini',
    defaultEmbedModel: 'text-embedding-3-small',
    embedDimensions: 1536,
    keySetting: 'openai_api_key',
    chatModelSetting: 'openai_chat_model',
    keysUrl: 'https://platform.openai.com/api-keys',
    envKey: 'OPENAI_API_KEY',
  },
};

const PROVIDER_SETTING = 'ai_provider';

interface Resolved {
  provider: Provider;
  spec: ProviderSpec;
  apiKey: string | null;
  chatModel: string;
  embedModel: string;
}

let cache: Resolved | null = null;

/** Reads provider, key and model names. Cached; refreshed when the panel saves. */
export async function resolveProvider(prisma: PrismaClient): Promise<Resolved> {
  if (cache) return cache;

  let provider: Provider = 'mistral';
  const values = new Map<string, string>();

  try {
    const rows = await prisma.platformSetting.findMany({
      where: {
        key: {
          in: [
            PROVIDER_SETTING,
            ...Object.values(PROVIDERS).flatMap((s) => [s.keySetting, s.chatModelSetting]),
          ],
        },
      },
    });
    for (const r of rows) values.set(r.key, r.value);
    const chosen = values.get(PROVIDER_SETTING);
    if (chosen === 'openai' || chosen === 'mistral') provider = chosen;
  } catch {
    // Settings unreadable — the environment fallback below still works.
  }

  const spec = PROVIDERS[provider];
  const stored = decryptIfPresent(values.get(spec.keySetting));
  const apiKey = stored || process.env[spec.envKey] || null;

  cache = {
    provider,
    spec,
    apiKey,
    chatModel: values.get(spec.chatModelSetting) || spec.defaultChatModel,
    embedModel: spec.defaultEmbedModel,
  };
  return cache;
}

export function clearProviderCache(): void {
  cache = null;
}

/** True when the selected provider has a key. Callers degrade rather than fail. */
export async function isAIConfigured(prisma: PrismaClient): Promise<boolean> {
  const r = await resolveProvider(prisma);
  return !!r.apiKey;
}

/** Dimensions the current embedding model produces, for detecting stale chunks. */
export async function embeddingDimensions(prisma: PrismaClient): Promise<number> {
  const r = await resolveProvider(prisma);
  return r.spec.embedDimensions;
}

/**
 * Remembers which request shape a model accepted, so the compatibility retry
 * costs one rejected call per model per process, not one per request.
 */
const shapeByModel = new Map<string, 'modern' | 'legacy'>();

/** Reasoning models bill thinking against the completion budget. */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/i.test(model);
}

function buildBody(
  shape: 'modern' | 'legacy',
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  temperature: number,
) {
  if (shape === 'legacy') return { model, messages, max_tokens: maxTokens, temperature };

  // A reasoning model spends max_completion_tokens on reasoning first and
  // returns whatever budget is left as text -- which is routinely none. Asking
  // gpt-5-mini for a 500-token rewrite returned an empty string with HTTP 200,
  // all 500 tokens consumed thinking. Nothing here needs deliberation, so
  // reasoning is turned down and the budget given a floor, otherwise picking a
  // gpt-5 model in the panel would look like the AI had quietly stopped
  // working.
  if (isReasoningModel(model)) {
    return {
      model,
      messages,
      max_completion_tokens: Math.max(maxTokens, 256),
      reasoning_effort: 'minimal',
    };
  }
  return { model, messages, max_completion_tokens: maxTokens };
}

/** Does this error say the request shape was wrong, rather than the request? */
function isShapeComplaint(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('max_tokens') ||
    m.includes('max_completion_tokens') ||
    (m.includes('temperature') && (m.includes('unsupported') || m.includes('does not support')))
  );
}

export interface ChatResult {
  content: string;
  model: string;
  provider: Provider;
}

/**
 * One chat completion against whichever provider is selected.
 *
 * Returns null rather than throwing: every caller in this codebase treats AI as
 * an optional enhancement over a deterministic path, and an outage should mean
 * "no suggestion" rather than a failed request.
 */
export async function chatCompletion(
  prisma: PrismaClient,
  params: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  },
): Promise<ChatResult | null> {
  const r = await resolveProvider(prisma);
  if (!r.apiKey) return null;

  const messages = [
    { role: 'system', content: params.system },
    { role: 'user', content: params.user },
  ];
  const maxTokens = params.maxTokens ?? 500;
  const temperature = params.temperature ?? 0.4;

  // Mistral takes the classic shape; for OpenAI the generation matters, so
  // start from whatever worked last and let the retry correct a wrong guess.
  const first: 'modern' | 'legacy' =
    shapeByModel.get(r.chatModel) ?? (r.provider === 'openai' ? 'modern' : 'legacy');

  for (const shape of [first, first === 'modern' ? 'legacy' : 'modern'] as const) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 20000);
    try {
      const res = await fetch(`${r.spec.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${r.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(shape, r.chatModel, messages, maxTokens, temperature)),
        signal: controller.signal,
      });

      if (res.ok) {
        const j: any = await res.json();
        const content: string = j?.choices?.[0]?.message?.content?.trim();
        if (!content) return null;
        shapeByModel.set(r.chatModel, shape);
        return { content, model: r.chatModel, provider: r.provider };
      }

      const j: any = await res.json().catch(() => ({}));
      const message = String(j?.error?.message || res.statusText);
      if (res.status === 400 && isShapeComplaint(message)) {
        // Wrong shape for this model — try the other one.
        continue;
      }
      console.error(`[AI] ${r.provider}/${r.chatModel} HTTP ${res.status}: ${message.slice(0, 200)}`);
      return null;
    } catch (err: any) {
      console.error(`[AI] ${r.provider}/${r.chatModel} failed: ${err?.message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Embeddings, in input order. Entries are null when the call failed. */
export async function embed(
  prisma: PrismaClient,
  input: string[],
): Promise<(number[] | null)[]> {
  const r = await resolveProvider(prisma);
  if (!r.apiKey || input.length === 0) return input.map(() => null);

  try {
    const res = await fetch(`${r.spec.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${r.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: r.embedModel, input }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const j: any = await res.json().catch(() => ({}));
      console.error(`[AI] embeddings HTTP ${res.status}: ${String(j?.error?.message).slice(0, 160)}`);
      return input.map(() => null);
    }
    const j: any = await res.json();
    // Both vendors return results tagged with their own index. Sort by it
    // rather than trusting array order.
    const byIndex = new Map<number, number[]>();
    for (const item of j?.data || []) {
      if (Array.isArray(item?.embedding)) byIndex.set(item.index, item.embedding);
    }
    return input.map((_, i) => byIndex.get(i) ?? null);
  } catch (err: any) {
    console.error(`[AI] embeddings failed: ${err?.message}`);
    return input.map(() => null);
  }
}

// ============================================
// PANEL
// ============================================

export interface ProviderStatus {
  provider: Provider;
  label: string;
  chatModel: string;
  embedModel: string;
  embedDimensions: number;
  hasKey: boolean;
  keySource: 'stored' | 'environment' | 'none';
  keysUrl: string;
}

export async function getProviderStatus(prisma: PrismaClient): Promise<{
  active: Provider;
  providers: ProviderStatus[];
}> {
  const rows = await prisma.platformSetting.findMany({
    where: {
      key: {
        in: [
          PROVIDER_SETTING,
          ...Object.values(PROVIDERS).flatMap((s) => [s.keySetting, s.chatModelSetting]),
        ],
      },
    },
  });
  const values = new Map(rows.map((r) => [r.key, r.value]));
  const activeRaw = values.get(PROVIDER_SETTING);
  const active: Provider = activeRaw === 'openai' ? 'openai' : 'mistral';

  const providers = (Object.keys(PROVIDERS) as Provider[]).map((p) => {
    const spec = PROVIDERS[p];
    const stored = decryptIfPresent(values.get(spec.keySetting));
    const fromEnv = process.env[spec.envKey];
    return {
      provider: p,
      label: spec.label,
      chatModel: values.get(spec.chatModelSetting) || spec.defaultChatModel,
      embedModel: spec.defaultEmbedModel,
      embedDimensions: spec.embedDimensions,
      hasKey: !!(stored || fromEnv),
      // Never the key itself — only where it came from.
      keySource: (stored ? 'stored' : fromEnv ? 'environment' : 'none') as ProviderStatus['keySource'],
      keysUrl: spec.keysUrl,
    };
  });

  return { active, providers };
}

export async function saveProviderSettings(
  prisma: PrismaClient,
  input: { provider?: Provider; apiKey?: string; chatModel?: string; forProvider?: Provider },
): Promise<void> {
  const target = input.forProvider || input.provider;
  const writes: any[] = [];
  const put = (key: string, value: string) =>
    writes.push(
      prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    );

  if (input.provider) put(PROVIDER_SETTING, input.provider);
  if (target) {
    const spec = PROVIDERS[target];
    if (input.apiKey) put(spec.keySetting, encryptSecret(input.apiKey));
    if (input.chatModel) put(spec.chatModelSetting, input.chatModel);
  }

  if (writes.length) await prisma.$transaction(writes);
  clearProviderCache();
}

/**
 * Sends one real request and reports what came back.
 *
 * Reports the provider's own status and message rather than a guess. The first
 * version said "check the key, the model and that the account has credit" for
 * every failure, which is three guesses when the provider already said exactly
 * which one it was -- both accounts turned out to be returning 429, and that
 * sentence would have sent someone hunting through key settings instead.
 */
export async function testProvider(
  prisma: PrismaClient,
  provider?: Provider,
): Promise<{ ok: boolean; detail: string; model?: string }> {
  const saved = cache;
  try {
    if (provider) {
      clearProviderCache();
      const status = await getProviderStatus(prisma);
      const row = status.providers.find((p) => p.provider === provider);
      if (!row?.hasKey) return { ok: false, detail: `No API key stored for ${PROVIDERS[provider].label}.` };

      const rows = await prisma.platformSetting.findMany({
        where: { key: PROVIDERS[provider].keySetting },
      });
      const key = decryptIfPresent(rows[0]?.value) || process.env[PROVIDERS[provider].envKey] || null;
      if (!key) return { ok: false, detail: 'No API key available.' };
      cache = {
        provider,
        spec: PROVIDERS[provider],
        apiKey: key,
        chatModel: row.chatModel,
        embedModel: row.embedModel,
      };
    }

    const r = await resolveProvider(prisma);
    if (!r.apiKey) return { ok: false, detail: 'No API key configured.' };

    const res = await fetch(`${r.spec.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${r.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildBody(
          shapeByModel.get(r.chatModel) ?? (r.provider === 'openai' ? 'modern' : 'legacy'),
          r.chatModel,
          [
            { role: 'system', content: 'Reply with exactly the word: ok' },
            { role: 'user', content: 'ping' },
          ],
          // Not 16: on a reasoning model that budget is gone before any text
          // is produced, and the test would report a working provider as broken.
          64,
          0.4,
        ),
      ),
      signal: AbortSignal.timeout(15000),
    }).catch((err: any) => {
      throw new Error(`could not reach ${r.spec.baseUrl}: ${err?.message}`);
    });

    const j: any = await res.json().catch(() => ({}));

    if (res.ok) {
      const content = j?.choices?.[0]?.message?.content?.trim();
      return content
        ? { ok: true, detail: `${r.spec.label} replied "${content.slice(0, 40)}"`, model: r.chatModel }
        : { ok: false, detail: `${r.spec.label} accepted the request but returned no text.`, model: r.chatModel };
    }

    const message = String(j?.error?.message || j?.message || res.statusText);
    // Name the likely cause where the status makes it unambiguous, and quote
    // the provider verbatim otherwise.
    const hint =
      res.status === 401 ? 'The API key was rejected.'
      : res.status === 429 ? 'Rate limited or out of credit.'
      : res.status === 404 ? `The model "${r.chatModel}" was not found on this account.`
      : `HTTP ${res.status}.`;
    return { ok: false, detail: `${hint} ${r.spec.label} said: ${message.slice(0, 160)}`, model: r.chatModel };
  } catch (err: any) {
    return { ok: false, detail: err?.message || 'The request failed.' };
  } finally {
    cache = saved;
  }
}
