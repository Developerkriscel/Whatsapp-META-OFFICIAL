import React, { useState } from 'react';
import {
  X, ChevronRight, ChevronLeft, CheckCircle2, ShieldCheck, Key, Phone,
  Globe, Copy, Check, ExternalLink, HelpCircle, AlertCircle, Sparkles, RefreshCw
} from 'lucide-react';
import { api } from '../api/client';

interface WizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialCredentials?: {
    appId?: string;
    appSecret?: string;
    accessToken?: string;
    wabaId?: string;
  };
  initialPhone?: {
    id?: string;
    phoneNumber?: string;
    displayName?: string;
    metaPhoneId?: string;
  };
}

export default function WhatsAppSetupWizardModal({
  isOpen,
  onClose,
  onSuccess,
  initialCredentials,
  initialPhone,
}: WizardModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedVerify, setCopiedVerify] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [formData, setFormData] = useState({
    appId: initialCredentials?.appId || '',
    appSecret: initialCredentials?.appSecret || '',
    wabaId: initialCredentials?.wabaId || '',
    accessToken: initialCredentials?.accessToken || '',
    phoneNumber: initialPhone?.phoneNumber || '',
    displayName: initialPhone?.displayName || '',
    metaPhoneId: initialPhone?.metaPhoneId || '',
  });

  if (!isOpen) return null;

  const webhookUrl = `${window.location.origin.replace(':5173', ':3001').replace(':5174', ':3001')}/webhook`;
  const verifyToken = 'your-webhook-verify-token';

  const steps = [
    { title: 'Meta App Creation', desc: 'App ID & App Secret' },
    { title: 'Business Account', desc: 'WABA ID' },
    { title: 'Access Token', desc: 'System User Token' },
    { title: 'Phone Number', desc: 'Number & Meta Phone ID' },
    { title: 'Webhook Setup', desc: 'Callback URL' },
    { title: 'Test Connection', desc: 'Verify & Finish' },
  ];

  const handleCopy = (text: string, type: 'webhook' | 'verify') => {
    navigator.clipboard.writeText(text);
    if (type === 'webhook') {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else {
      setCopiedVerify(true);
      setTimeout(() => setCopiedVerify(false), 2000);
    }
  };

  const handleNext = async () => {
    // Save credentials when leaving step 3
    if (currentStep === 3) {
      try {
        await api.post('/whatsapp/credentials', {
          appId: formData.appId,
          appSecret: formData.appSecret,
          wabaId: formData.wabaId,
          accessToken: formData.accessToken,
        });
      } catch (e) {
        console.error('Failed saving credentials:', e);
      }
    }

    // Save phone number when leaving step 4
    if (currentStep === 4) {
      try {
        if (initialPhone?.id) {
          await api.patch(`/whatsapp/phone-numbers/${initialPhone.id}`, {
            phoneNumber: formData.phoneNumber,
            displayName: formData.displayName,
            metaPhoneId: formData.metaPhoneId,
          });
        } else if (formData.phoneNumber) {
          await api.post('/whatsapp/phone-numbers', {
            phoneNumber: formData.phoneNumber,
            displayName: formData.displayName,
            metaPhoneId: formData.metaPhoneId,
          });
        }
      } catch (e) {
        console.error('Failed saving phone number:', e);
      }
    }

    if (currentStep < 6) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleSkip = () => {
    if (currentStep < 6) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      // First save latest credentials & phone number
      await Promise.all([
        api.post('/whatsapp/credentials', {
          appId: formData.appId,
          appSecret: formData.appSecret,
          wabaId: formData.wabaId,
          accessToken: formData.accessToken,
        }),
        initialPhone?.id
          ? api.patch(`/whatsapp/phone-numbers/${initialPhone.id}`, {
              phoneNumber: formData.phoneNumber,
              displayName: formData.displayName,
              metaPhoneId: formData.metaPhoneId,
            })
          : formData.phoneNumber
          ? api.post('/whatsapp/phone-numbers', {
              phoneNumber: formData.phoneNumber,
              displayName: formData.displayName,
              metaPhoneId: formData.metaPhoneId,
            })
          : Promise.resolve(),
      ]);

      const res = await api.post('/whatsapp/credentials/test');
      if (res.data?.success) {
        setTestResult({
          success: true,
          message: 'Meta Cloud API Connected Successfully! Credentials and Meta Phone ID are verified.',
        });
        if (onSuccess) onSuccess();
      } else {
        setTestResult({
          success: false,
          message: res.data?.error?.message || 'Failed connecting to Meta API. Please check token & Phone ID.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.response?.data?.error?.message || err.message || 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-apple-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-black/10">

        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-apple-lg bg-wa-green/20 text-wa-green flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5 text-wa-green" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Meta WhatsApp API Setup Wizard
                <span className="text-xs bg-wa-green/20 text-wa-green px-2 py-0.5 rounded-full border border-wa-green/30">Guided Walkthrough</span>
              </h2>
              <p className="text-xs text-slate-400">Step-by-step onboarding with Facebook Developer UI previews</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-apple-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Tracker */}
        <div className="px-6 py-3 bg-slate-50 border-b border-black/5 flex items-center justify-between overflow-x-auto">
          {steps.map((step, idx) => {
            const stepNum = idx + 1;
            const isActive = currentStep === stepNum;
            const isDone = currentStep > stepNum;
            return (
              <div
                key={stepNum}
                onClick={() => setCurrentStep(stepNum)}
                className={`flex items-center gap-2 cursor-pointer transition py-1 px-2.5 rounded-apple-lg ${
                  isActive ? 'bg-white shadow-sm border border-black/10' : 'hover:bg-slate-200/50'
                }`}
              >
                <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  isDone ? 'bg-apple-green text-white' : isActive ? 'bg-wa-green text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {isDone ? <Check className="w-3.5 h-3.5" /> : stepNum}
                </div>
                <div className="hidden sm:block text-left">
                  <p className={`text-xs font-medium ${isActive ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                    {step.title}
                  </p>
                </div>
                {idx < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 ml-1 hidden lg:block" />}
              </div>
            );
          })}
        </div>

        {/* Body Content with Meta Preview Side-by-Side */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/50">

          {/* Left Column: Form & Instructions (7 cols) */}
          <div className="lg:col-span-7 space-y-4 bg-white p-5 rounded-apple-xl border border-black/5 shadow-sm">

            {/* STEP 1: Meta App ID & Secret */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-wa-green" /> Step 1: Create Meta App & Get App ID
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Log into <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-wa-green underline font-medium inline-flex items-center gap-0.5">developers.facebook.com <ExternalLink className="w-3 h-3"/></a> and create a <strong>Business App</strong> with WhatsApp product.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Meta App ID</label>
                    <input
                      type="text"
                      value={formData.appId}
                      onChange={(e) => setFormData({ ...formData, appId: e.target.value })}
                      placeholder="e.g. 1502654484880767"
                      className="input-apple w-full font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Meta App Secret</label>
                    <input
                      type="password"
                      value={formData.appSecret}
                      onChange={(e) => setFormData({ ...formData, appSecret: e.target.value })}
                      placeholder="Enter Meta App Secret"
                      className="input-apple w-full font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: WABA ID */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-wa-green" /> Step 2: Get WhatsApp Business Account ID (WABA ID)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Your WABA ID links your tenant profile to Meta's Business Account infrastructure.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Business Account ID (WABA ID)</label>
                  <input
                    type="text"
                    value={formData.wabaId}
                    onChange={(e) => setFormData({ ...formData, wabaId: e.target.value })}
                    placeholder="e.g. 1029485569660598"
                    className="input-apple w-full font-mono text-sm"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Found in Meta Developer Console under WhatsApp -&gt; API Setup -&gt; Step 1.</p>
                </div>
              </div>
            )}

            {/* STEP 3: Access Token */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Key className="w-5 h-5 text-wa-green" /> Step 3: Add Permanent Access Token
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Generate a permanent System User token in Meta Business Manager to prevent 24h expiration.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Meta System User Access Token</label>
                  <textarea
                    rows={4}
                    value={formData.accessToken}
                    onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                    placeholder="Paste access token starting with EAAG... or EAAB..."
                    className="input-apple w-full font-mono text-xs"
                  />
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-apple-lg text-[11px] text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Pro Tip:</strong> Create a System User in Business Manager with <code>whatsapp_business_messaging</code> permission set to 'Never Expire'.</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Phone Number & Meta Phone ID */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Phone className="w-5 h-5 text-wa-green" /> Step 4: Phone Line & Meta Phone Number ID
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Connect your WhatsApp phone line and set its unique Meta Phone ID.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number (E.164 format)</label>
                    <input
                      type="text"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      placeholder="e.g. +15551949254 or +919074271866"
                      className="input-apple w-full font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Display Name</label>
                    <input
                      type="text"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      placeholder="e.g. Kriscel WA Support"
                      className="input-apple w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Meta Phone Number ID <span className="text-apple-red">*</span></label>
                    <input
                      type="text"
                      value={formData.metaPhoneId}
                      onChange={(e) => setFormData({ ...formData, metaPhoneId: e.target.value })}
                      placeholder="e.g. 1183576551512466"
                      className="input-apple w-full font-mono text-sm border-wa-green/40 focus:border-wa-green"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Located in Meta Developer Portal under <strong>WhatsApp -&gt; API Setup -&gt; Phone number ID</strong>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Webhook Configuration */}
            {currentStep === 5 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-wa-green" /> Step 5: Webhook Configuration
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Paste these endpoint details into Meta Developer Console -&gt; WhatsApp -&gt; Configuration.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Callback URL</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={webhookUrl}
                        className="input-apple w-full font-mono text-xs bg-slate-100"
                      />
                      <button
                        onClick={() => handleCopy(webhookUrl, 'webhook')}
                        className="px-3 py-2 btn-apple btn-apple-outline text-xs flex items-center gap-1 shrink-0"
                      >
                        {copiedWebhook ? <Check className="w-3.5 h-3.5 text-apple-green" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedWebhook ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Verify Token</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={verifyToken}
                        className="input-apple w-full font-mono text-xs bg-slate-100"
                      />
                      <button
                        onClick={() => handleCopy(verifyToken, 'verify')}
                        className="px-3 py-2 btn-apple btn-apple-outline text-xs flex items-center gap-1 shrink-0"
                      >
                        {copiedVerify ? <Check className="w-3.5 h-3.5 text-apple-green" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedVerify ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: Test & Finish */}
            {currentStep === 6 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-wa-green" /> Step 6: Verify Connection & Complete
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Test your credentials and Meta Phone ID against Meta Graph API v18.0.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-apple-xl border border-black/5 space-y-3">
                  <div className="text-xs space-y-1 font-mono text-slate-600">
                    <p>• App ID: {formData.appId || 'Configured'}</p>
                    <p>• WABA ID: {formData.wabaId || 'Configured'}</p>
                    <p>• Access Token: {formData.accessToken ? '••••••••' + formData.accessToken.slice(-8) : 'Not set'}</p>
                    <p>• Meta Phone ID: {formData.metaPhoneId || 'Not set'}</p>
                  </div>

                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="w-full py-3 bg-wa-green text-white rounded-apple-lg font-semibold text-sm flex items-center justify-center gap-2 hover:bg-wa-green/90 transition shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
                    {isTesting ? 'Testing Meta Connection...' : 'Test Connection Now'}
                  </button>

                  {testResult && (
                    <div className={`p-3 rounded-apple-lg text-xs font-medium flex items-start gap-2 ${
                      testResult.success ? 'bg-apple-green/20 text-apple-green border border-apple-green/30' : 'bg-apple-red/10 text-apple-red border border-apple-red/20'
                    }`}>
                      {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Visual Facebook Console UI Mockup Preview (5 cols) */}
          <div className="lg:col-span-5 bg-slate-900 text-slate-200 p-5 rounded-apple-xl border border-slate-800 flex flex-col justify-between shadow-inner">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block animate-pulse"></span>
                  Meta Console Visual Guide
                </span>
                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-mono">developers.facebook.com</span>
              </div>

              {/* Dynamic Mockup Content per Step */}
              {currentStep === 1 && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 bg-slate-800/80 rounded border border-slate-700">
                    <p className="text-slate-400 text-[10px]">App Settings &gt; Basic</p>
                    <div className="mt-2 space-y-2">
                      <div className="p-2 bg-slate-900 rounded border border-wa-green/50">
                        <span className="text-[10px] text-slate-400 block">App ID</span>
                        <span className="text-wa-green font-bold">1502654484880767</span>
                      </div>
                      <div className="p-2 bg-slate-900 rounded">
                        <span className="text-[10px] text-slate-400 block">App Secret</span>
                        <span className="text-slate-300">••••••••••••••••</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    💡 <strong>Where to find:</strong> Open developers.facebook.com -&gt; Select your App -&gt; App Settings -&gt; Basic.
                  </p>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 bg-slate-800/80 rounded border border-slate-700">
                    <p className="text-slate-400 text-[10px]">WhatsApp &gt; API Setup (Step 1)</p>
                    <div className="mt-2 p-2 bg-slate-900 rounded border border-wa-green/50">
                      <span className="text-[10px] text-slate-400 block">WhatsApp Business Account ID</span>
                      <span className="text-wa-green font-bold">1029485569660598</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    💡 <strong>Where to find:</strong> In Meta Developer Console, click WhatsApp -&gt; API Setup on the left menu.
                  </p>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 bg-slate-800/80 rounded border border-slate-700">
                    <p className="text-slate-400 text-[10px]">Business Settings &gt; System Users</p>
                    <div className="mt-2 space-y-2">
                      <div className="p-2 bg-slate-900 rounded border border-wa-green/50">
                        <span className="text-[10px] text-slate-400 block">Permissions Selected:</span>
                        <span className="text-wa-green text-[11px] block">✓ whatsapp_business_messaging</span>
                        <span className="text-wa-green text-[11px] block">✓ whatsapp_business_management</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    💡 <strong>Pro Tip:</strong> Generate a <strong>System User Token</strong> set to 'Never Expire' so your SaaS application stays connected 24/7.
                  </p>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 bg-slate-800/80 rounded border border-slate-700">
                    <p className="text-slate-400 text-[10px]">WhatsApp &gt; API Setup &gt; Step 1</p>
                    <div className="mt-2 space-y-2">
                      <div className="p-2 bg-slate-900 rounded border border-wa-green/50">
                        <span className="text-[10px] text-slate-400 block">Phone number ID</span>
                        <span className="text-wa-green font-bold">1183576551512466</span>
                      </div>
                      <div className="p-2 bg-slate-900 rounded border border-blue-500/50">
                        <span className="text-[10px] text-slate-400 block">To (Test Recipients)</span>
                        <span className="text-blue-400">+919074271866</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    💡 <strong>Important:</strong> Copy the exact 15-digit <strong>Phone number ID</strong> (not the WABA ID) into the field on the left.
                  </p>
                </div>
              )}

              {currentStep === 5 && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 bg-slate-800/80 rounded border border-slate-700">
                    <p className="text-slate-400 text-[10px]">WhatsApp &gt; Configuration &gt; Webhook</p>
                    <div className="mt-2 space-y-2">
                      <div className="p-2 bg-slate-900 rounded">
                        <span className="text-[10px] text-slate-400 block">Callback URL</span>
                        <span className="text-slate-200 text-[10px] break-all">{webhookUrl}</span>
                      </div>
                      <div className="p-2 bg-slate-900 rounded">
                        <span className="text-[10px] text-slate-400 block">Webhook Fields</span>
                        <span className="text-wa-green text-[10px]">✓ messages, message_template_status_update</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans">
                    💡 Enables incoming WhatsApp customer message delivery and live delivery receipts in your inbox.
                  </p>
                </div>
              )}

              {currentStep === 6 && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 bg-slate-800/80 rounded border border-wa-green/50 text-center py-6">
                    <CheckCircle2 className="w-10 h-10 text-wa-green mx-auto mb-2" />
                    <p className="text-wa-green font-bold text-sm">Meta Cloud API v18.0</p>
                    <p className="text-slate-400 text-[10px] mt-1">Ready for Multi-Tenant Messaging</p>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans text-center">
                    Click <strong>Test Connection Now</strong> to perform a live handshake check with Meta servers.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
              <span>Meta Graph API v18.0</span>
              <span>Step {currentStep} of 6</span>
            </div>
          </div>

        </div>

        {/* Footer with Skip & Next Buttons */}
        <div className="p-4 bg-white border-t border-black/5 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              {currentStep === 6 ? 'Close' : 'Skip Step'}
            </button>

            {currentStep < 6 ? (
              <button
                onClick={handleNext}
                className="px-5 py-2.5 bg-wa-green text-white text-sm font-semibold rounded-apple-lg hover:bg-wa-green/90 transition shadow-sm flex items-center gap-1.5"
              >
                Next Step <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => {
                  if (onSuccess) onSuccess();
                  onClose();
                }}
                className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-apple-lg hover:bg-slate-800 transition shadow-sm flex items-center gap-1.5"
              >
                Finish Setup <Check className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
