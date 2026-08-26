/**
 * Knowledge Base manager — create/delete knowledge bases, add/remove text
 * documents (chunked + embedded server-side), and test a question against a
 * knowledge base before wiring it into a flow's AI Reply step.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  X, Plus, Trash2, Database, FileText, Loader2, CheckCircle2,
  AlertCircle, Clock, Sparkles, Search,
} from 'lucide-react';
import { useToast } from './Toast';

interface KnowledgeBaseModalProps {
  onClose: () => void;
}

const STATUS_ICON: Record<string, { icon: any; color: string }> = {
  PENDING: { icon: Clock, color: 'text-apple-orange' },
  EMBEDDED: { icon: CheckCircle2, color: 'text-apple-green' },
  FAILED: { icon: AlertCircle, color: 'text-apple-red' },
};

export default function KnowledgeBaseModal({ onClose }: KnowledgeBaseModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [showCreateKb, setShowCreateKb] = useState(false);
  const [newKbName, setNewKbName] = useState('');
  const [newKbDescription, setNewKbDescription] = useState('');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [testQuestion, setTestQuestion] = useState('');
  const [testResult, setTestResult] = useState<{ reply: string | null; chunks: any[]; message?: string } | null>(null);

  const { data: knowledgeBases, isLoading: kbsLoading } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: async () => (await api.get('/knowledge-bases')).data.data,
  });

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['knowledge-base-documents', selectedKbId],
    queryFn: async () => (await api.get(`/knowledge-bases/${selectedKbId}/documents`)).data.data,
    enabled: !!selectedKbId,
  });

  const createKb = useMutation({
    mutationFn: async () => (await api.post('/knowledge-bases', { name: newKbName, description: newKbDescription || undefined })).data.data,
    onSuccess: (kb) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      setShowCreateKb(false);
      setNewKbName('');
      setNewKbDescription('');
      setSelectedKbId(kb.id);
      toast.success('Knowledge base created');
    },
    onError: () => toast.error('Failed to create knowledge base'),
  });

  const deleteKb = useMutation({
    mutationFn: async (id: string) => api.delete(`/knowledge-bases/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      setSelectedKbId(null);
      toast.success('Knowledge base deleted');
    },
    onError: () => toast.error('Failed to delete knowledge base'),
  });

  const addDocument = useMutation({
    mutationFn: async () =>
      (await api.post(`/knowledge-bases/${selectedKbId}/documents`, { title: newDocTitle, content: newDocContent })).data.data,
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-documents', selectedKbId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      setNewDocTitle('');
      setNewDocContent('');
      if (doc.status === 'FAILED') {
        toast.error(doc.errorMessage || 'Failed to embed document');
      } else {
        toast.success('Document added and embedded');
      }
    },
    onError: () => toast.error('Failed to add document'),
  });

  const deleteDocument = useMutation({
    mutationFn: async (docId: string) => api.delete(`/knowledge-bases/${selectedKbId}/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-documents', selectedKbId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
  });

  const testKb = useMutation({
    mutationFn: async () => (await api.post(`/knowledge-bases/${selectedKbId}/test`, { question: testQuestion })).data.data,
    onSuccess: (data) => setTestResult(data),
    onError: () => toast.error('Test query failed'),
  });

  const selectedKb = (knowledgeBases || []).find((kb: any) => kb.id === selectedKbId);

  // Rendered via a portal to document.body — this modal is mounted deep
  // inside the routed page (<main class="relative z-10">), and that
  // "relative + explicit z-index" combination creates its own stacking
  // context, capping every descendant's z-index (including this modal's
  // z-[60]) at that ceiling. The sidebar (z-30) lives outside <main> at the
  // top level, so it was painting on top of this modal despite the lower
  // z-index number. Escaping to document.body sidesteps the trap entirely.
  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-apple-2xl shadow-apple-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-apple-lg flex items-center justify-center">
              <Database className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-ios-dark">Knowledge Bases</h2>
              <p className="text-xs text-ios-muted">Business info & FAQs your AI Reply steps can answer from</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-ios-gray rounded-apple-lg transition-colors">
            <X className="w-5 h-5 text-ios-muted" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: KB list */}
          <div className="w-60 flex-shrink-0 border-r border-black/5 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-black/5">
              <button
                onClick={() => setShowCreateKb(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-indigo-600 border-2 border-dashed border-indigo-200 rounded-apple-lg hover:bg-indigo-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New Knowledge Base
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {kbsLoading ? (
                <p className="text-xs text-ios-muted text-center py-4">Loading…</p>
              ) : (knowledgeBases || []).length === 0 ? (
                <p className="text-xs text-ios-muted text-center py-4 px-2">No knowledge bases yet.</p>
              ) : (
                (knowledgeBases || []).map((kb: any) => (
                  <button
                    key={kb.id}
                    onClick={() => { setSelectedKbId(kb.id); setTestResult(null); }}
                    className={`w-full text-left px-3 py-2.5 rounded-apple-lg transition-colors ${
                      selectedKbId === kb.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-ios-gray/50 border border-transparent'
                    }`}
                  >
                    <p className="text-sm font-medium text-ios-dark truncate">{kb.name}</p>
                    <p className="text-xs text-ios-muted mt-0.5">{kb.chunkCount} chunks · {kb.documentCount} docs</p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: selected KB detail */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedKb ? (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div>
                  <Database className="w-10 h-10 text-ios-muted mx-auto mb-3" />
                  <p className="text-sm font-medium text-ios-secondary">Select a knowledge base</p>
                  <p className="text-xs text-ios-muted mt-1">Or create a new one to get started</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-ios-dark">{selectedKb.name}</h3>
                    {selectedKb.description && <p className="text-xs text-ios-muted mt-0.5">{selectedKb.description}</p>}
                  </div>
                  <button
                    onClick={() => { if (confirm(`Delete "${selectedKb.name}" and all its documents?`)) deleteKb.mutate(selectedKb.id); }}
                    className="p-1.5 hover:bg-apple-red/10 rounded-apple-lg transition-colors"
                    title="Delete knowledge base"
                  >
                    <Trash2 className="w-4 h-4 text-apple-red" />
                  </button>
                </div>

                {/* Add document */}
                <div className="p-4 bg-ios-gray/30 rounded-apple-xl space-y-3">
                  <p className="text-xs font-semibold text-ios-secondary uppercase tracking-wide">Add Text Document</p>
                  <input
                    type="text"
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    placeholder="Title, e.g. Shipping Policy"
                    className="input-apple w-full"
                  />
                  <textarea
                    value={newDocContent}
                    onChange={(e) => setNewDocContent(e.target.value)}
                    placeholder="Paste the FAQ text, policy, or business info here…"
                    rows={5}
                    className="input-apple w-full resize-none"
                  />
                  <button
                    onClick={() => addDocument.mutate()}
                    disabled={!newDocTitle.trim() || !newDocContent.trim() || addDocument.isPending}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-apple-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {addDocument.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add & Embed
                  </button>
                </div>

                {/* Document list */}
                <div>
                  <p className="text-xs font-semibold text-ios-secondary uppercase tracking-wide mb-2">Documents</p>
                  {docsLoading ? (
                    <p className="text-xs text-ios-muted">Loading…</p>
                  ) : (documents || []).length === 0 ? (
                    <p className="text-xs text-ios-muted">No documents yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(documents || []).map((doc: any) => {
                        const s = STATUS_ICON[doc.status] || STATUS_ICON.PENDING;
                        const StatusIcon = s.icon;
                        return (
                          <div key={doc.id} className="flex items-center justify-between p-2.5 bg-white border border-black/5 rounded-apple-lg">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="w-4 h-4 text-ios-muted shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm text-ios-dark truncate">{doc.title}</p>
                                <div className={`flex items-center gap-1 text-xs ${s.color}`}>
                                  <StatusIcon className="w-3 h-3" />
                                  {doc.status === 'FAILED' && doc.errorMessage ? doc.errorMessage : `${doc.status} · ${doc.chunkCount} chunks`}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => deleteDocument.mutate(doc.id)}
                              className="p-1.5 hover:bg-apple-red/10 rounded-apple-lg transition-colors shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-apple-red" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Test panel */}
                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-apple-xl space-y-3">
                  <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Test a Question
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={testQuestion}
                      onChange={(e) => setTestQuestion(e.target.value)}
                      placeholder="e.g. What's your return policy?"
                      className="input-apple flex-1"
                      onKeyDown={(e) => { if (e.key === 'Enter' && testQuestion.trim()) testKb.mutate(); }}
                    />
                    <button
                      onClick={() => testKb.mutate()}
                      disabled={!testQuestion.trim() || testKb.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-apple-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {testKb.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Test
                    </button>
                  </div>
                  {testResult && (
                    <div className="mt-2 space-y-2">
                      {testResult.reply ? (
                        <div className="p-3 bg-white rounded-apple-lg border border-black/5">
                          <p className="text-xs font-semibold text-ios-secondary mb-1">Generated reply:</p>
                          <p className="text-sm text-ios-dark">{testResult.reply}</p>
                        </div>
                      ) : (
                        <div className="p-3 bg-apple-orange/10 rounded-apple-lg">
                          <p className="text-sm text-apple-orange">{testResult.message || 'No confident answer found.'}</p>
                        </div>
                      )}
                      {testResult.chunks.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-ios-secondary mb-1">Matched chunks:</p>
                          {testResult.chunks.map((c: any, i: number) => (
                            <p key={i} className="text-xs text-ios-muted bg-white p-2 rounded-apple-lg border border-black/5 mb-1">
                              <span className="font-mono text-indigo-600">{Math.round(c.similarity * 100)}%</span> — {c.content}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create KB sub-modal */}
      {showCreateKb && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold text-ios-dark">New Knowledge Base</h3>
            <input
              type="text"
              value={newKbName}
              onChange={(e) => setNewKbName(e.target.value)}
              placeholder="Name, e.g. Support FAQ"
              className="input-apple w-full"
              autoFocus
            />
            <input
              type="text"
              value={newKbDescription}
              onChange={(e) => setNewKbDescription(e.target.value)}
              placeholder="Description (optional)"
              className="input-apple w-full"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateKb(false)}
                className="px-4 py-2 text-sm font-medium text-ios-secondary hover:text-ios-dark border border-black/10 rounded-apple-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => createKb.mutate()}
                disabled={!newKbName.trim() || createKb.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-apple-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
