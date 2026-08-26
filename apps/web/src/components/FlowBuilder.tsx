/**
 * Visual Chatbot Flow Builder
 * Node-based visual editor for building WhatsApp bot flows.
 * Steps: Trigger → Message → Condition → Delay → Action → End
 */

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Zap, MessageSquare, GitBranch, Clock, Settings2, StopCircle,
  Plus, Trash2, ChevronDown, ChevronUp, ArrowDown, X, Check,
  User, Tag, Phone, Webhook, UserCheck, Sparkles, Database,
} from 'lucide-react';
import KnowledgeBaseModal from './KnowledgeBaseModal';

// ============================================
// Types
// ============================================

type StepType = 'trigger' | 'message' | 'condition' | 'delay' | 'action' | 'ai_reply' | 'end';

interface FlowStep {
  id: string;
  type: StepType;
  label?: string;
  // Trigger
  triggerType?: 'greeting' | 'keyword' | 'always';
  keyword?: string;
  // Message
  message?: string;
  // Condition
  conditionType?: 'contains' | 'equals' | 'starts_with' | 'has_tag';
  value?: string;
  truePath?: string | null;
  falsePath?: string | null;
  // Delay
  seconds?: number;
  // Action
  actionType?: 'handoff' | 'assign_agent' | 'assign_team' | 'close' | 'add_tag' | 'webhook';
  targetId?: string;
  tagName?: string;
  webhookUrl?: string;
  // AI Reply (RAG or simple description mode)
  useSimpleMode?: boolean;
  businessDescription?: string;
  knowledgeBaseId?: string;
  systemPrompt?: string;
  fallbackMessage?: string;
  // Navigation
  next?: string | null;
}

interface FlowData {
  steps: FlowStep[];
  variables: string[];
}

interface FlowBuilderProps {
  flowData: FlowData;
  flowName: string;
  onSave: (flowData: FlowData) => void;
  onClose: () => void;
  isSaving?: boolean;
}

// ============================================
// Step Config
// ============================================

const STEP_CONFIG: Record<StepType, { label: string; color: string; bg: string; border: string; icon: any }> = {
  trigger: { label: 'Trigger', color: 'text-wa-green', bg: 'bg-wa-green/10', border: 'border-wa-green/30', icon: Zap },
  message: { label: 'Send Message', color: 'text-wa-teal', bg: 'bg-wa-teal/10', border: 'border-wa-teal/30', icon: MessageSquare },
  condition: { label: 'Condition', color: 'text-apple-purple', bg: 'bg-apple-purple/10', border: 'border-apple-purple/30', icon: GitBranch },
  delay: { label: 'Wait / Delay', color: 'text-apple-orange', bg: 'bg-apple-orange/10', border: 'border-apple-orange/30', icon: Clock },
  action: { label: 'Action', color: 'text-apple-blue', bg: 'bg-apple-blue/10', border: 'border-apple-blue/30', icon: Settings2 },
  ai_reply: { label: 'AI Reply (RAG)', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-300', icon: Sparkles },
  end: { label: 'End Flow', color: 'text-ios-muted', bg: 'bg-ios-gray', border: 'border-black/10', icon: StopCircle },
};

// ============================================
// Utility
// ============================================

function generateId(type: string): string {
  return `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * The visual builder only ever manages step ORDER (add/delete/move) — it
 * never wrote a `next` id onto any step. The execution engine navigates
 * purely by `currentStep.next`/`truePath`/`falsePath` string ids, so every
 * flow saved without this ran its trigger and then just stopped, no matter
 * how many steps followed. Derive the links from array order at save time
 * so what gets persisted always matches what the canvas visually shows.
 */
function relinkSteps(steps: FlowStep[]): FlowStep[] {
  return steps.map((step, i) => {
    const nextId = i < steps.length - 1 ? steps[i + 1].id : null;
    if (step.type === 'end') return { ...step, next: null };
    if (step.type === 'condition') return { ...step, next: nextId, truePath: nextId };
    return { ...step, next: nextId };
  });
}

function getStepDescription(step: FlowStep): string {
  switch (step.type) {
    case 'trigger':
      if (step.triggerType === 'keyword') return `Keyword: "${step.keyword || '...'}"`;
      if (step.triggerType === 'greeting') return 'First message from contact';
      return 'Always triggered';
    case 'message':
      return step.message ? (step.message.length > 60 ? step.message.slice(0, 60) + '…' : step.message) : 'No message set';
    case 'condition':
      return step.conditionType ? `If message ${step.conditionType} "${step.value || '...'}"` : 'Configure condition';
    case 'delay':
      if (!step.seconds) return 'Set wait time';
      if (step.seconds < 60) return `Wait ${step.seconds}s`;
      return `Wait ${Math.floor(step.seconds / 60)}m ${step.seconds % 60 > 0 ? `${step.seconds % 60}s` : ''}`;
    case 'action':
      if (step.actionType === 'handoff') return 'Hand off to human agent';
      if (step.actionType === 'assign_agent') return 'Assign to agent';
      if (step.actionType === 'assign_team') return 'Assign to team';
      if (step.actionType === 'close') return 'Close conversation';
      if (step.actionType === 'add_tag') return `Add tag: ${step.tagName || '...'}`;
      if (step.actionType === 'webhook') return `Call webhook`;
      return 'Configure action';
    case 'ai_reply':
      if (step.useSimpleMode) return step.businessDescription ? 'AI answers using your business description' : 'Describe your business';
      return step.knowledgeBaseId ? 'AI answers using your knowledge base' : 'Select a knowledge base';
    case 'end':
      return 'Flow ends here';
    default:
      return '';
  }
}

// ============================================
// Step Node Component
// ============================================

function StepNode({
  step,
  index,
  total,
  isSelected,
  onSelect,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  step: FlowStep;
  index: number;
  total: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const config = STEP_CONFIG[step.type];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center">
      {/* Node */}
      <div
        onClick={onSelect}
        className={`w-full max-w-sm cursor-pointer rounded-apple-xl border-2 transition-all ${
          isSelected
            ? `${config.border} shadow-apple-hover bg-white`
            : `border-transparent bg-white shadow-apple hover:shadow-apple-hover`
        }`}
      >
        <div className={`flex items-center gap-3 p-4 rounded-apple-xl ${config.bg}`}>
          <div className={`w-9 h-9 rounded-apple-lg flex items-center justify-center ${config.bg}`}>
            <Icon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold uppercase tracking-wide ${config.color}`}>{config.label}</p>
            <p className="text-sm text-ios-dark font-medium mt-0.5 truncate">{getStepDescription(step)}</p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            {index > 0 && (
              <button
                onClick={e => { e.stopPropagation(); onMoveUp(); }}
                className="p-1.5 hover:bg-black/5 rounded-lg transition-colors"
                title="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5 text-ios-muted" />
              </button>
            )}
            {index < total - 1 && (
              <button
                onClick={e => { e.stopPropagation(); onMoveDown(); }}
                className="p-1.5 hover:bg-black/5 rounded-lg transition-colors"
                title="Move down"
              >
                <ChevronDown className="w-3.5 h-3.5 text-ios-muted" />
              </button>
            )}
            {step.type !== 'trigger' && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className="p-1.5 hover:bg-apple-red/10 rounded-lg transition-colors"
                title="Delete step"
              >
                <Trash2 className="w-3.5 h-3.5 text-apple-red" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Connector line + Add button (except after last step) */}
      {index < total - 1 && (
        <div className="flex flex-col items-center my-1 relative">
          <div className="w-0.5 h-4 bg-black/10" />
          <ArrowDown className="w-4 h-4 text-ios-muted -mt-1" />
        </div>
      )}
    </div>
  );
}

// ============================================
// Step Editor Panel
// ============================================

function StepEditor({
  step,
  onChange,
  onManageKnowledgeBases,
}: {
  step: FlowStep;
  onChange: (updated: FlowStep) => void;
  onManageKnowledgeBases: () => void;
}) {
  const set = (updates: Partial<FlowStep>) => onChange({ ...step, ...updates });

  return (
    <div className="space-y-4">
      {/* Trigger */}
      {step.type === 'trigger' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Trigger Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['greeting', 'keyword', 'always'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => set({ triggerType: t })}
                  className={`py-2 px-3 rounded-apple-lg text-sm font-medium border transition-all ${
                    step.triggerType === t
                      ? 'bg-wa-green text-white border-wa-green'
                      : 'bg-ios-gray text-ios-secondary border-transparent hover:border-wa-green/30'
                  }`}
                >
                  {t === 'greeting' ? '👋 First msg' : t === 'keyword' ? '🔤 Keyword' : '⚡ Always'}
                </button>
              ))}
            </div>
          </div>
          {step.triggerType === 'keyword' && (
            <div>
              <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Keyword</label>
              <input
                type="text"
                value={step.keyword || ''}
                onChange={e => set({ keyword: e.target.value })}
                placeholder="e.g., hello, order, support"
                className="input-apple w-full"
              />
              <p className="text-xs text-ios-muted mt-1">Trigger fires when customer message contains this keyword</p>
            </div>
          )}
          {step.triggerType === 'greeting' && (
            <p className="text-sm text-ios-secondary bg-ios-gray rounded-apple-lg p-3">
              ℹ️ This flow will trigger on every new conversation or first message from a contact.
            </p>
          )}
        </>
      )}

      {/* Message */}
      {step.type === 'message' && (
        <div>
          <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Message Text</label>
          <textarea
            value={step.message || ''}
            onChange={e => set({ message: e.target.value })}
            placeholder="Type your message here... Use {{contact_name}} for personalization"
            rows={5}
            className="input-apple w-full resize-none"
          />
          <div className="flex gap-2 mt-2 flex-wrap">
            {['{{contact_name}}', '{{business_name}}', '{{agent_name}}'].map(v => (
              <button
                key={v}
                onClick={() => set({ message: (step.message || '') + v })}
                className="text-xs px-2 py-1 bg-wa-green/10 text-wa-green rounded-apple font-mono hover:bg-wa-green/20 transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
          <p className="text-xs text-ios-muted mt-2">Supports emojis and line breaks. Variables are substituted at runtime.</p>
        </div>
      )}

      {/* Condition */}
      {step.type === 'condition' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Condition Type</label>
            <select
              value={step.conditionType || 'contains'}
              onChange={e => set({ conditionType: e.target.value as any })}
              className="input-apple w-full"
            >
              <option value="contains">Message contains</option>
              <option value="equals">Message equals</option>
              <option value="starts_with">Message starts with</option>
              <option value="has_tag">Contact has tag</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Value</label>
            <input
              type="text"
              value={step.value || ''}
              onChange={e => set({ value: e.target.value })}
              placeholder={step.conditionType === 'has_tag' ? 'Tag name' : 'Text to match'}
              className="input-apple w-full"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 p-3 bg-ios-gray/50 rounded-apple-lg">
            <div>
              <p className="text-xs font-semibold text-apple-green mb-1">✅ If TRUE → goes to</p>
              <p className="text-xs text-ios-muted">Next step in flow</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-apple-red mb-1">❌ If FALSE → goes to</p>
              <p className="text-xs text-ios-muted">Skips to next step</p>
            </div>
          </div>
        </>
      )}

      {/* Delay */}
      {step.type === 'delay' && (
        <div>
          <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Wait Duration</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={86400}
              value={step.seconds || 30}
              onChange={e => set({ seconds: parseInt(e.target.value) || 30 })}
              className="input-apple w-32"
            />
            <span className="text-sm text-ios-secondary">seconds</span>
          </div>
          <div className="flex gap-2 mt-3">
            {[30, 60, 300, 3600].map(s => (
              <button
                key={s}
                onClick={() => set({ seconds: s })}
                className={`text-xs px-3 py-1.5 rounded-apple border transition-all ${
                  step.seconds === s ? 'bg-wa-green text-white border-wa-green' : 'border-black/10 text-ios-secondary hover:border-wa-green/30'
                }`}
              >
                {s < 60 ? `${s}s` : s < 3600 ? `${s / 60}m` : '1h'}
              </button>
            ))}
          </div>
          <p className="text-xs text-ios-muted mt-2">
            ⚠️ Delays use BullMQ job queues in production. Make sure Redis is configured.
          </p>
        </div>
      )}

      {/* Action */}
      {step.type === 'action' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Action Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'handoff', label: '🧑 Human handoff', icon: UserCheck },
                { value: 'assign_agent', label: '👤 Assign agent', icon: User },
                { value: 'assign_team', label: '👥 Assign team', icon: User },
                { value: 'close', label: '✅ Close conversation', icon: Check },
                { value: 'add_tag', label: '🏷️ Add tag', icon: Tag },
                { value: 'webhook', label: '🔗 Call webhook', icon: Webhook },
              ].map(a => (
                <button
                  key={a.value}
                  onClick={() => set({ actionType: a.value as any })}
                  className={`py-2 px-3 rounded-apple-lg text-sm text-left border transition-all ${
                    step.actionType === a.value
                      ? 'bg-apple-blue/10 text-apple-blue border-apple-blue/30 font-medium'
                      : 'bg-ios-gray text-ios-secondary border-transparent hover:border-apple-blue/20'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {step.actionType === 'add_tag' && (
            <div>
              <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Tag Name</label>
              <input
                type="text"
                value={step.tagName || ''}
                onChange={e => set({ tagName: e.target.value })}
                placeholder="e.g., hot-lead, vip, support"
                className="input-apple w-full"
              />
            </div>
          )}

          {step.actionType === 'webhook' && (
            <div>
              <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Webhook URL</label>
              <input
                type="url"
                value={step.webhookUrl || ''}
                onChange={e => set({ webhookUrl: e.target.value })}
                placeholder="https://your-server.com/webhook"
                className="input-apple w-full font-mono text-sm"
              />
              <p className="text-xs text-ios-muted mt-1">POST request with conversation context as JSON body</p>
            </div>
          )}

          {(step.actionType === 'handoff' || step.actionType === 'close') && (
            <div className="p-3 bg-ios-gray/50 rounded-apple-lg">
              <p className="text-sm text-ios-secondary">
                {step.actionType === 'handoff'
                  ? '🧑 Bot will be deactivated and conversation flagged for human review.'
                  : '✅ Conversation will be marked as closed and archived.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* AI Reply (RAG) */}
      {step.type === 'ai_reply' && (
        <AIReplyEditor step={step} set={set} onManageKnowledgeBases={onManageKnowledgeBases} />
      )}

      {/* End */}
      {step.type === 'end' && (
        <div className="p-4 bg-ios-gray/50 rounded-apple-xl text-center">
          <StopCircle className="w-8 h-8 text-ios-muted mx-auto mb-2" />
          <p className="text-sm text-ios-secondary font-medium">End of Flow</p>
          <p className="text-xs text-ios-muted mt-1">The conversation returns to normal after this point.</p>
        </div>
      )}

      {/* Label (optional for all types) */}
      <div>
        <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Step Label (optional)</label>
        <input
          type="text"
          value={step.label || ''}
          onChange={e => set({ label: e.target.value })}
          placeholder="Give this step a name..."
          className="input-apple w-full"
        />
      </div>
    </div>
  );
}

// ============================================
// AI Reply (RAG) Editor
// ============================================

function AIReplyEditor({
  step,
  set,
  onManageKnowledgeBases,
}: {
  step: FlowStep;
  set: (updates: Partial<FlowStep>) => void;
  onManageKnowledgeBases: () => void;
}) {
  const simpleMode = step.useSimpleMode !== false; // default to simple mode for new steps

  const { data: knowledgeBases } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: async () => (await api.get('/knowledge-bases')).data.data,
    enabled: !simpleMode,
  });

  return (
    <>
      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-ios-gray/50 rounded-apple-lg">
        <button
          onClick={() => set({ useSimpleMode: true })}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-apple-lg text-xs font-semibold transition-all ${
            simpleMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-ios-secondary hover:text-ios-dark'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> Simple
        </button>
        <button
          onClick={() => set({ useSimpleMode: false })}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-apple-lg text-xs font-semibold transition-all ${
            !simpleMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-ios-secondary hover:text-ios-dark'
          }`}
        >
          <Database className="w-3.5 h-3.5" /> Knowledge Base
        </button>
      </div>

      {simpleMode ? (
        <div>
          <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">About Your Business</label>
          <textarea
            value={step.businessDescription || ''}
            onChange={e => set({ businessDescription: e.target.value })}
            placeholder="e.g. We're Kriscel WA, an official WhatsApp Business Partner. We help businesses send bulk WhatsApp campaigns, run chatbots, and manage customer conversations. Support hours: Mon-Fri 9am-6pm IST..."
            rows={6}
            className="input-apple w-full resize-none"
          />
          <p className="text-xs text-ios-muted mt-1.5">
            No setup needed — the AI answers naturally from this description alone, like a quick-start chatbot (à la Bolna.ai). For precise, document-grounded answers, switch to Knowledge Base mode instead.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide">Knowledge Base</label>
            <button onClick={onManageKnowledgeBases} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
              <Database className="w-3 h-3" /> Manage
            </button>
          </div>
          <select
            value={step.knowledgeBaseId || ''}
            onChange={e => set({ knowledgeBaseId: e.target.value || undefined })}
            className="input-apple w-full"
          >
            <option value="">Select a knowledge base…</option>
            {(knowledgeBases || []).map((kb: any) => (
              <option key={kb.id} value={kb.id}>
                {kb.name} ({kb.chunkCount} chunks)
              </option>
            ))}
          </select>
          {(knowledgeBases || []).length === 0 && (
            <p className="text-xs text-ios-muted mt-1.5">
              No knowledge bases yet — click "Manage" to create one and add your business info/FAQs.
            </p>
          )}
        </>
      )}

      <div className="mt-4">
        <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">System Prompt / Persona</label>
        <textarea
          value={step.systemPrompt || ''}
          onChange={e => set({ systemPrompt: e.target.value })}
          placeholder="You are a helpful assistant for {{business_name}}. Answer only using the provided context."
          rows={3}
          className="input-apple w-full resize-none"
        />
      </div>

      <div className="mt-4">
        <label className="block text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Fallback Message</label>
        <input
          type="text"
          value={step.fallbackMessage || ''}
          onChange={e => set({ fallbackMessage: e.target.value })}
          placeholder="Used when the AI can't find a confident answer"
          className="input-apple w-full"
        />
        <p className="text-xs text-ios-muted mt-1.5">
          Sent instead if there's no relevant answer in the knowledge base — the bot never stays silent.
        </p>
      </div>
    </>
  );
}

// ============================================
// Add Step Menu
// ============================================

function AddStepButton({ onAdd }: { onAdd: (type: StepType) => void }) {
  const [open, setOpen] = useState(false);

  const stepTypes: { type: StepType; label: string; icon: any; desc: string }[] = [
    { type: 'message', label: 'Send Message', icon: MessageSquare, desc: 'Send a text to the contact' },
    { type: 'ai_reply', label: 'AI Reply (RAG)', icon: Sparkles, desc: 'Answer using AI + your knowledge base' },
    { type: 'condition', label: 'Condition', icon: GitBranch, desc: 'Branch based on a condition' },
    { type: 'delay', label: 'Wait / Delay', icon: Clock, desc: 'Pause before next step' },
    { type: 'action', label: 'Action', icon: Settings2, desc: 'Assign, tag, close, or webhook' },
    { type: 'end', label: 'End Flow', icon: StopCircle, desc: 'End the conversation flow' },
  ];

  return (
    <div className="relative flex flex-col items-center my-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-wa-green border-2 border-dashed border-wa-green/40 rounded-apple-lg hover:bg-wa-green/5 hover:border-wa-green transition-all"
      >
        <Plus className="w-4 h-4" />
        Add Step
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-2 z-20 bg-white rounded-apple-xl shadow-apple-lg border border-black/10 w-64 overflow-hidden">
            {stepTypes.map(s => {
              const Icon = s.icon;
              const cfg = STEP_CONFIG[s.type];
              return (
                <button
                  key={s.type}
                  onClick={() => { onAdd(s.type); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ios-gray/50 transition-colors text-left"
                >
                  <div className={`w-8 h-8 rounded-apple-lg flex items-center justify-center ${cfg.bg}`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ios-dark">{s.label}</p>
                    <p className="text-xs text-ios-muted">{s.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Main Flow Builder
// ============================================

export default function FlowBuilder({ flowData, flowName, onSave, onClose, isSaving }: FlowBuilderProps) {
  const [steps, setSteps] = useState<FlowStep[]>(() => {
    // Ensure there's always a trigger at start
    const existing = flowData.steps || [];
    if (existing.length === 0 || existing[0].type !== 'trigger') {
      return [
        { id: generateId('trigger'), type: 'trigger', triggerType: 'greeting', label: 'Flow Start' },
        ...existing,
      ];
    }
    return existing;
  });
  const [variables, setVariables] = useState<string[]>(flowData.variables || []);
  const [selectedId, setSelectedId] = useState<string | null>(steps[0]?.id || null);
  const [showKnowledgeBases, setShowKnowledgeBases] = useState(false);

  const selectedStep = steps.find(s => s.id === selectedId) || null;

  const handleUpdateStep = useCallback((updated: FlowStep) => {
    setSteps(prev => prev.map(s => s.id === updated.id ? updated : s));
  }, []);

  const handleAddStep = useCallback((afterIndex: number, type: StepType) => {
    const newStep: FlowStep = {
      id: generateId(type),
      type,
      // Defaults per type
      ...(type === 'trigger' ? { triggerType: 'greeting' } : {}),
      ...(type === 'delay' ? { seconds: 30 } : {}),
      ...(type === 'action' ? { actionType: 'handoff' } : {}),
      ...(type === 'ai_reply' ? {
        useSimpleMode: true,
        systemPrompt: "You are a helpful, friendly assistant for {{business_name}}.",
        fallbackMessage: "I'm not sure about that — let me connect you with a member of our team.",
      } : {}),
    };
    setSteps(prev => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newStep);
      return next;
    });
    setSelectedId(newStep.id);
  }, []);

  const handleDeleteStep = useCallback((id: string) => {
    setSteps(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (selectedId === id) setSelectedId(filtered[0]?.id || null);
      return filtered;
    });
  }, [selectedId]);

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 1) return; // Can't move trigger or second item above trigger
    setSteps(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setSteps(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  const handleSave = () => {
    onSave({ steps: relinkSteps(steps), variables });
  };

  // Portal to document.body — mounted inside <main class="relative z-10">,
  // whose "relative + explicit z-index" creates a stacking context that caps
  // this modal's z-50 below the sidebar's z-30 (which lives outside <main>
  // at the top level and otherwise wins regardless of the z-index numbers).
  return createPortal(
    <>
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-apple-2xl shadow-apple-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-wa-gradient rounded-apple-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-ios-dark">{flowName}</h2>
              <p className="text-xs text-ios-muted">{steps.length} step{steps.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-ios-secondary hover:text-ios-dark border border-black/10 rounded-apple-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-sm font-semibold text-white bg-wa-gradient rounded-apple-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 shadow-wa"
            >
              {isSaving ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
              ) : (
                <><Check className="w-4 h-4" />Save Flow</>
              )}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-ios-gray rounded-apple-lg transition-colors">
              <X className="w-5 h-5 text-ios-muted" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: Flow Canvas */}
          <div className="flex-1 overflow-y-auto p-6 bg-ios-gray/20">
            <div className="flex flex-col items-center max-w-sm mx-auto">
              {/* Start label */}
              <div className="mb-4 px-3 py-1 bg-wa-green/10 border border-wa-green/20 rounded-apple-full">
                <p className="text-xs font-semibold text-wa-green uppercase tracking-wide">▶ Flow Start</p>
              </div>

              {steps.map((step, index) => (
                <div key={step.id} className="w-full flex flex-col items-center">
                  <StepNode
                    step={step}
                    index={index}
                    total={steps.length}
                    isSelected={selectedId === step.id}
                    onSelect={() => setSelectedId(step.id)}
                    onDelete={() => handleDeleteStep(step.id)}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                  />
                  {/* Add step button after each non-trigger step */}
                  {index < steps.length - 1 && step.type !== 'end' && (
                    <AddStepButton onAdd={type => handleAddStep(index, type)} />
                  )}
                </div>
              ))}

              {/* Add step at the end (unless last step is 'end') */}
              {steps[steps.length - 1]?.type !== 'end' && (
                <div className="mt-2">
                  <AddStepButton onAdd={type => handleAddStep(steps.length - 1, type)} />
                </div>
              )}

              {/* End label */}
              <div className="mt-4 px-3 py-1 bg-ios-gray border border-black/10 rounded-apple-full">
                <p className="text-xs font-semibold text-ios-muted uppercase tracking-wide">■ Flow End</p>
              </div>
            </div>
          </div>

          {/* Right: Step Editor */}
          <div className="w-80 flex-shrink-0 border-l border-black/5 flex flex-col overflow-hidden bg-white">
            {selectedStep ? (
              <>
                <div className={`px-5 py-4 border-b border-black/5 ${STEP_CONFIG[selectedStep.type].bg}`}>
                  <div className="flex items-center gap-2">
                    {(() => { const Icon = STEP_CONFIG[selectedStep.type].icon; return <Icon className={`w-4 h-4 ${STEP_CONFIG[selectedStep.type].color}`} />; })()}
                    <p className={`text-sm font-semibold ${STEP_CONFIG[selectedStep.type].color}`}>
                      {STEP_CONFIG[selectedStep.type].label}
                    </p>
                  </div>
                  <p className="text-xs text-ios-muted mt-0.5">Configure this step</p>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  <StepEditor
                    step={selectedStep}
                    onChange={handleUpdateStep}
                    onManageKnowledgeBases={() => setShowKnowledgeBases(true)}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div>
                  <Settings2 className="w-10 h-10 text-ios-muted mx-auto mb-3" />
                  <p className="text-sm font-medium text-ios-secondary">Select a step to edit</p>
                  <p className="text-xs text-ios-muted mt-1">Click any node on the canvas</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer legend */}
        <div className="flex items-center gap-4 px-6 py-3 border-t border-black/5 bg-ios-gray/20 flex-shrink-0 flex-wrap">
          {Object.entries(STEP_CONFIG).map(([type, cfg]) => {
            const Icon = cfg.icon;
            return (
              <div key={type} className="flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                <span className="text-xs text-ios-muted">{cfg.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    {showKnowledgeBases && <KnowledgeBaseModal onClose={() => setShowKnowledgeBases(false)} />}
    </>,
    document.body
  );
}
