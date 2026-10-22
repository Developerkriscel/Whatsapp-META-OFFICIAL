import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  ArrowLeft, Plus, X, CheckCircle2, Loader2, AlertCircle,
  Smile, Bold, Italic, Strikethrough, Code, Braces,
  MessageSquare, LayoutGrid, Clock, Mail, ShoppingBag
} from 'lucide-react';
import TemplateQualityPanel from '../components/TemplateQualityPanel';
import WhatsAppPreview from '../components/WhatsAppPreview';

const TEMPLATE_TYPES = [
  { key: 'INTERACTIVE', label: 'Interactive', icon: MessageSquare },
  { key: 'CAROUSEL', label: 'Carousel', icon: LayoutGrid },
  { key: 'LTO', label: 'LTO (Limited Time Offer)', icon: Clock },
  { key: 'CATALOG', label: 'Catalog', icon: Mail },
  { key: 'MPM', label: 'MPM (Multi Product Message)', icon: ShoppingBag },
] as const;

const HEADER_OPTIONS = [
  { key: 'NONE', label: 'None' },
  { key: 'TEXT', label: 'Text' },
  { key: 'MEDIA', label: 'Media' },
] as const;

const BUTTON_TYPES = [
  { value: 'QUICK_REPLY', label: 'Quick Reply' },
  { value: 'URL', label: 'Visit Website' },
  { value: 'PHONE_NUMBER', label: 'Call Phone Number' },
] as const;

interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

const BODY_MAX = 1028;

export default function CreateTemplatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sampleFileRef = useRef<HTMLInputElement>(null);

  const [templateType, setTemplateType] = useState('INTERACTIVE');
  const [headerType, setHeaderType] = useState<'NONE' | 'TEXT' | 'MEDIA'>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerMediaFormat, setHeaderMediaFormat] = useState<'IMAGE' | 'VIDEO' | 'DOCUMENT'>('IMAGE');
  const [headerSampleUrl, setHeaderSampleUrl] = useState('');
  const [headerSamplePath, setHeaderSamplePath] = useState('');
  const [headerSampleName, setHeaderSampleName] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [footer, setFooter] = useState('');
  const [buttons, setButtons] = useState<TemplateButton[]>([]);
  const [sampleUploading, setSampleUploading] = useState(false);
  const [sampleError, setSampleError] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savingAs, setSavingAs] = useState<'draft' | 'submit' | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('MARKETING');
  const [language, setLanguage] = useState('en_US');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [templateNameError, setTemplateNameError] = useState('');

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const { data: phoneNumbersData } = useQuery({
    queryKey: ['phone-numbers'],
    queryFn: async () => {
      const response = await api.get('/phone-numbers');
      return response.data.data || [];
    },
    retry: false,
  });
  const phoneNumbers: { id: string; phoneNumber: string; displayName?: string }[] = Array.isArray(phoneNumbersData) ? phoneNumbersData : [];

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const ACCEPT_BY_FORMAT: Record<string, string> = {
    IMAGE: 'image/jpeg,image/png',
    VIDEO: 'video/mp4,video/3gpp',
    DOCUMENT: 'application/pdf',
  };

  const uploadHeaderSample = async (file: File) => {
    setSampleError('');
    setSampleUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api.post('/uploads/campaign-media', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const up = res.data?.data;
      setHeaderSampleUrl(up.url);
      setHeaderSamplePath(up.path);
      setHeaderSampleName(up.originalName || file.name);
    } catch (err: any) {
      setSampleError(err?.response?.data?.error?.message || 'Upload failed. Please try again.');
    } finally {
      setSampleUploading(false);
      if (sampleFileRef.current) sampleFileRef.current.value = '';
    }
  };

  const insertFormatting = (wrapper: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = bodyText.substring(start, end);
    const before = bodyText.substring(0, start);
    const after = bodyText.substring(end);
    if (selected) {
      setBodyText(before + wrapper + selected + wrapper + after);
    } else {
      setBodyText(before + wrapper + wrapper + after);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + wrapper.length, start + wrapper.length);
      }, 0);
    }
  };

  const insertVariable = () => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const vars = bodyText.match(/\{\{\d+\}\}/g) || [];
    const nextNum = vars.length + 1;
    const pos = textarea.selectionStart;
    const before = bodyText.substring(0, pos);
    const after = bodyText.substring(pos);
    setBodyText(before + `{{${nextNum}}}` + after);
  };

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons([...buttons, { type: 'QUICK_REPLY', text: '' }]);
  };

  const updateButton = (index: number, updates: Partial<TemplateButton>) => {
    setButtons(buttons.map((b, i) => i === index ? { ...b, ...updates } : b));
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const resolvedHeaderFormat = headerType === 'NONE' ? 'NONE' : headerType === 'TEXT' ? 'TEXT' : headerMediaFormat;

  const createMutation = useMutation({
    mutationFn: async (asDraft: boolean) => {
      setSavingAs(asDraft ? 'draft' : 'submit');
      const payload: any = {
        name,
        category,
        language,
        body: { text: bodyText },
        phoneNumberId: phoneNumberId || undefined,
      };
      if (footer.trim()) payload.footer = footer;
      if (buttons.length > 0) {
        payload.buttons = buttons
          .filter(b => b.text.trim())
          .map(b => {
            const btn: any = { type: b.type, text: b.text };
            if (b.type === 'URL' && b.url) btn.url = b.url;
            if (b.type === 'PHONE_NUMBER' && b.phone_number) btn.phone_number = b.phone_number;
            return btn;
          });
      }

      if (headerType === 'TEXT' && headerText.trim()) {
        payload.header = { type: 'TEXT', format: 'TEXT', text: headerText };
      } else if (headerType === 'MEDIA' && headerSamplePath) {
        payload.header = {
          type: headerMediaFormat,
          format: headerMediaFormat,
          sampleUrl: headerSampleUrl,
          samplePath: headerSamplePath,
        };
      }

      const response = await api.post('/templates', payload);
      return response.data;
    },
    onSuccess: (_data: any, asDraft: boolean) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      showNotification('success', asDraft ? 'Template saved as draft!' : 'Template submitted for approval!');
      setTimeout(() => navigate('/templates'), 1200);
    },
    onError: (error: any) => {
      setSavingAs(null);
      const apiError = error.response?.data?.error;
      if (apiError?.code === 'DUPLICATE_TEMPLATE_NAME') {
        setTemplateNameError(apiError.message || 'This template name is already in use. Choose another.');
        return;
      }
      if (apiError?.code === 'UNAUTHORIZED') {
        showNotification('error', 'Please log out and log back in with a tenant account to create templates.');
        return;
      }
      showNotification('error', apiError?.message || 'Failed to create template');
    },
  });

  const isValid =
    name.trim() &&
    bodyText.trim() &&
    (phoneNumbers.length <= 1 || phoneNumberId) &&
    !sampleUploading &&
    !(headerType === 'MEDIA' && !headerSamplePath) &&
    !(headerType === 'TEXT' && !headerText.trim());

  return (
    <div className="min-h-screen">
      {notification && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-apple-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-right ${
          notification.type === 'success' ? 'bg-apple-green text-white' : 'bg-apple-red text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/templates')}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-apple-lg hover:bg-gray-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => createMutation.mutate(true)}
            disabled={!isValid || createMutation.isPending}
            className="flex items-center gap-2 px-5 py-2 border-2 border-wa-green text-wa-green rounded-apple-lg hover:bg-wa-green/10 disabled:opacity-50 transition font-medium rounded-lg"
          >
            {savingAs === 'draft' && createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            )}
            {savingAs === 'draft' && createMutation.isPending ? 'Saving...' : 'Save Template as Draft'}
          </button>
          <button
            onClick={() => createMutation.mutate(false)}
            disabled={!isValid || createMutation.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-wa-green text-white rounded-apple-lg hover:bg-wa-green/90 disabled:opacity-50 transition font-medium rounded-lg"
          >
            {savingAs === 'submit' && createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            )}
            {savingAs === 'submit' && createMutation.isPending ? 'Submitting...' : 'Save & Apply with Facebook'}
          </button>
        </div>
      </div>

      {/* Main content: Editor + Preview side by side */}
      <div className="flex gap-6">
        {/* Editor panel */}
        <div className="flex-1 space-y-6">
          {/* Template Name */}
          <div className="card-apple p-5">
            <label className="block text-sm font-semibold text-ios-dark mb-1">Template Name *</label>
            {templateNameError && (
              <p className="text-sm text-red-600 mb-2">{templateNameError}</p>
            )}
            <input
              type="text"
              placeholder="e.g., welcome_message"
              value={name}
              onChange={(e) => { setName(e.target.value); setTemplateNameError(''); }}
              className="input-apple w-full"
            />
          </div>

          {/* Submit Under Number */}
          {phoneNumbers.length > 1 && (
            <div className="card-apple p-5">
              <label className="block text-sm font-semibold text-ios-dark mb-1">Submit Under Number *</label>
              <select
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="input-apple w-full"
              >
                <option value="">Select a connected number...</option>
                {phoneNumbers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName || p.phoneNumber} — {p.phoneNumber}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ios-muted mt-1">
                Templates only exist within one WhatsApp Business Account — pick the number whose account this template should be submitted to.
              </p>
            </div>
          )}

          {/* Category & Language */}
          <div className="card-apple p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-ios-dark mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="input-apple w-full"
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-ios-dark mb-1">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="input-apple w-full"
                >
                  <option value="en_US">English (US)</option>
                  <option value="en_GB">English (UK)</option>
                  <option value="es">Spanish</option>
                  <option value="pt_BR">Portuguese (BR)</option>
                  <option value="ar">Arabic</option>
                  <option value="hi">Hindi</option>
                  <option value="zh_CN">Chinese (Simplified)</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="id">Indonesian</option>
                </select>
              </div>
            </div>
          </div>

          {/* Template Type */}
          <div className="card-apple p-5">
            <h2 className="text-base font-semibold text-ios-dark mb-1">Template Type</h2>
            <div className="flex flex-wrap gap-2 mt-3">
              {TEMPLATE_TYPES.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTemplateType(key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-apple-lg border text-sm font-medium transition ${
                    templateType === key
                      ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm'
                      : 'border-black/10 text-ios-dark hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Header */}
          <div className="card-apple p-5">
            <h2 className="text-base font-semibold text-ios-dark mb-1">Header</h2>
            <p className="text-sm text-ios-secondary mb-3">Add a title or choose which type of media you'll use for this header.</p>
            <div className="flex gap-2">
              {HEADER_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setHeaderType(key);
                    if (key === 'NONE' || key === 'TEXT') {
                      setHeaderSampleUrl('');
                      setHeaderSamplePath('');
                      setHeaderSampleName('');
                    }
                    if (key === 'NONE' || key === 'MEDIA') {
                      setHeaderText('');
                    }
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-apple-full border text-sm font-medium transition ${
                    headerType === key
                      ? 'border-indigo-500 bg-indigo-500 text-white'
                      : 'border-black/10 text-ios-dark hover:border-indigo-300'
                  }`}
                >
                  {key === 'NONE' && <X className="w-4 h-4" />}
                  {key === 'TEXT' && <span className="font-serif text-base leading-none">T</span>}
                  {key === 'MEDIA' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                  )}
                  {label}
                </button>
              ))}
            </div>

            {headerType === 'TEXT' && (
              <input
                type="text"
                placeholder="Enter header text"
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                maxLength={60}
                className="input-apple w-full mt-3"
              />
            )}

            {headerType === 'MEDIA' && (
              <div className="mt-3 space-y-3">
                <div className="flex gap-2">
                  {(['IMAGE', 'VIDEO', 'DOCUMENT'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setHeaderMediaFormat(f);
                        setHeaderSampleUrl('');
                        setHeaderSamplePath('');
                        setHeaderSampleName('');
                      }}
                      className={`px-3 py-1.5 text-xs rounded-apple-lg border transition ${
                        headerMediaFormat === f
                          ? 'border-wa-green bg-wa-green/10 text-wa-green font-medium'
                          : 'border-black/10 text-ios-muted hover:border-wa-green/40'
                      }`}
                    >
                      {f.charAt(0) + f.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ios-muted">
                  Meta reviews a sample of the {headerMediaFormat.toLowerCase()} before approving the template.
                </p>
                <input
                  ref={sampleFileRef}
                  type="file"
                  accept={ACCEPT_BY_FORMAT[headerMediaFormat]}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadHeaderSample(f);
                  }}
                  className="block w-full text-sm text-ios-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-apple-lg file:border-0 file:bg-wa-green/10 file:text-wa-green"
                />
                {sampleUploading && <p className="text-xs text-ios-muted">Uploading sample...</p>}
                {sampleError && <p className="text-xs text-red-600">{sampleError}</p>}
                {headerSampleUrl && (
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-wa-green" />
                    <span className="text-ios-dark truncate">{headerSampleName}</span>
                    <button
                      type="button"
                      onClick={() => { setHeaderSampleUrl(''); setHeaderSamplePath(''); setHeaderSampleName(''); }}
                      className="text-ios-muted hover:text-red-600 underline"
                    >
                      remove
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="card-apple p-5">
            <h2 className="text-base font-semibold text-ios-dark mb-1">Body</h2>
            <p className="text-sm text-ios-secondary mb-3">Enter the text for your message in the language that you've selected.</p>
            <textarea
              ref={bodyRef}
              placeholder="Enter body text"
              value={bodyText}
              onChange={(e) => {
                if (e.target.value.length <= BODY_MAX) setBodyText(e.target.value);
              }}
              rows={6}
              className="input-apple w-full resize-y"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-ios-muted">Characters: {bodyText.length}/{BODY_MAX}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => {}} className="p-1.5 rounded hover:bg-ios-gray transition" title="Emoji">
                  <Smile className="w-4 h-4 text-amber-500" />
                </button>
                <button type="button" onClick={() => insertFormatting('*')} className="p-1.5 rounded hover:bg-ios-gray transition" title="Bold">
                  <Bold className="w-4 h-4 text-ios-secondary" />
                </button>
                <button type="button" onClick={() => insertFormatting('_')} className="p-1.5 rounded hover:bg-ios-gray transition" title="Italic">
                  <Italic className="w-4 h-4 text-ios-secondary" />
                </button>
                <button type="button" onClick={() => insertFormatting('~')} className="p-1.5 rounded hover:bg-ios-gray transition" title="Strikethrough">
                  <Strikethrough className="w-4 h-4 text-ios-secondary" />
                </button>
                <button type="button" onClick={() => insertFormatting('```')} className="p-1.5 rounded hover:bg-ios-gray transition" title="Monospace">
                  <Code className="w-4 h-4 text-ios-secondary" />
                </button>
                <button type="button" onClick={insertVariable} className="p-1.5 rounded hover:bg-ios-gray transition" title="Insert Variable">
                  <Braces className="w-4 h-4 text-ios-secondary" />
                </button>
              </div>
            </div>
            <TemplateQualityPanel
              category={category}
              bodyText={bodyText}
              onApplySuggestion={(text) => setBodyText(text)}
            />
          </div>

          {/* Footer */}
          <div className="card-apple p-5">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold text-ios-dark">Footer</h2>
              <span className="text-xs bg-ios-gray text-ios-secondary px-2 py-0.5 rounded-apple-full">Optional</span>
            </div>
            <p className="text-sm text-ios-secondary mb-3">Add a short line of text to the bottom of your message template.</p>
            <div className="relative">
              <input
                type="text"
                placeholder="Enter Footer Text"
                value={footer}
                onChange={(e) => {
                  if (e.target.value.length <= 60) setFooter(e.target.value);
                }}
                maxLength={60}
                className="input-apple w-full pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ios-muted">
                {footer.length}/60
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="card-apple p-5">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold text-ios-dark">Buttons</h2>
              <span className="text-xs bg-ios-gray text-ios-secondary px-2 py-0.5 rounded-apple-full">Optional</span>
            </div>
            <p className="text-sm text-ios-secondary mb-3">Create buttons that let customers respond to your message or take action.</p>

            {buttons.map((btn, i) => (
              <div key={i} className="flex items-start gap-3 mb-3 p-3 bg-ios-gray/50 rounded-apple-lg">
                <div className="flex-1 space-y-2">
                  <select
                    value={btn.type}
                    onChange={(e) => updateButton(i, { type: e.target.value })}
                    className="input-apple w-full text-sm"
                  >
                    {BUTTON_TYPES.map((bt) => (
                      <option key={bt.value} value={bt.value}>{bt.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Button text"
                    value={btn.text}
                    onChange={(e) => updateButton(i, { text: e.target.value })}
                    maxLength={25}
                    className="input-apple w-full text-sm"
                  />
                  {btn.type === 'URL' && (
                    <input
                      type="url"
                      placeholder="https://example.com"
                      value={btn.url || ''}
                      onChange={(e) => updateButton(i, { url: e.target.value })}
                      className="input-apple w-full text-sm"
                    />
                  )}
                  {btn.type === 'PHONE_NUMBER' && (
                    <input
                      type="tel"
                      placeholder="+1234567890"
                      value={btn.phone_number || ''}
                      onChange={(e) => updateButton(i, { phone_number: e.target.value })}
                      className="input-apple w-full text-sm"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeButton(i)}
                  className="p-1 hover:bg-ios-gray rounded transition mt-1"
                >
                  <X className="w-4 h-4 text-ios-muted" />
                </button>
              </div>
            ))}

            {buttons.length < 3 && (
              <button
                type="button"
                onClick={addButton}
                className="flex items-center gap-2 px-4 py-2 border border-dashed border-black/20 rounded-apple-lg text-sm text-ios-secondary hover:border-wa-green hover:text-wa-green transition"
              >
                <Plus className="w-4 h-4" />
                Add Button
              </button>
            )}
          </div>
        </div>

        {/* Preview panel */}
        <div className="w-[340px] shrink-0 sticky top-6 self-start">
          <WhatsAppPreview
            body={bodyText || 'Your message will appear here...'}
            headerFormat={resolvedHeaderFormat === 'NONE' ? null : resolvedHeaderFormat}
            headerText={headerText}
            mediaUrl={headerSampleUrl}
            mediaName={headerSampleName}
            footer={footer || undefined}
            buttons={buttons.filter(b => b.text.trim())}
            businessName={
              phoneNumbers.find((p: any) => p.id === phoneNumberId)?.displayName
              || phoneNumbers[0]?.displayName
              || 'Your Business'
            }
          />
        </div>
      </div>
    </div>
  );
}
