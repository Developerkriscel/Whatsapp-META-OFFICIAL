// WHATSAPP WEBHOOK -- Complete Server Implementation
// Handles all WhatsApp Cloud API webhook events

// ============================================
// Types
// ============================================

export interface WhatsAppConfig {
  verifyToken: string;
  accessToken: string;
  graphApiBase: string;
  apiVersion: string;
  phoneNumberId: string;
  mockMode: boolean;
}

export interface WebhookBody {
  object: string;
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: WebhookValue;
  field: string;
}

export interface WebhookValue {
  messaging_product: string;
  metadata: WebhookMetadata;
  contacts?: WebhookContact[];
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
  errors?: WhatsAppError[];
}

export interface WebhookMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface WebhookContact {
  profile: { name: string };
  wa_id: string;
}

export interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: MessageType;
  text?: { body: string };
  image?: MediaMessage;
  audio?: MediaMessage;
  video?: MediaMessage;
  document?: MediaMessage;
  location?: LocationMessage;
  contacts?: ContactCard[];
  interactive?: InteractiveMessage;
  button?: { payload: string; text: string };
  reaction?: { emoji: string; message_id: string };
  context?: { from: string; id: string };
}

export interface MediaMessage {
  id: string;
  mime_type: string;
  sha256: string;
  caption?: string;
}

export interface LocationMessage {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface ContactCard {
  name: { first_name: string; last_name?: string; formatted_name: string };
  phones: { phone: string; type?: string }[];
  emails?: { email: string; type?: string }[];
  org?: { company?: string; department?: string };
}

export interface InteractiveMessage {
  type: string;
  button_reply?: { id: string; title: string };
  list_reply?: { id: string; title: string; description?: string };
}

export interface WebhookStatus {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
  recipient_type: string;
  pricing?: { billable: boolean; category: string };
  error?: { code: number; title: string };
}

export interface WhatsAppError {
  code: number;
  title: string;
  error_data?: { details: string };
}

export type MessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'button'
  | 'reaction'
  | 'context';

export interface TenantInfo {
  tenantId: string;
  phoneNumberId: string;
  phoneNumber: string;
}

// ============================================
// WhatsApp Graph API Types
// ============================================

export interface SendMessageRequest {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text' | 'image' | 'video' | 'document' | 'audio' | 'sticker' | 'template';
  text?: { body: string; preview_url?: boolean };
  image?: { id?: string; link?: string; caption?: string };
  video?: { id?: string; link?: string; caption?: string };
  document?: { id?: string; link?: string; caption?: string; filename?: string };
  audio?: { id?: string; link?: string };
  sticker?: { id: string };
  template?: TemplateMessage;
}

export interface TemplateMessage {
  name: string;
  language: { code: string };
  components?: TemplateComponent[];
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button' | 'footer';
  format?: 'text' | 'image' | 'video' | 'document';
  text?: string;
  image?: { link?: string };
  video?: { link?: string };
  document?: { link?: string; filename?: string };
  buttons?: { type: 'url' | 'quick_reply'; text?: string; url?: string; payload?: string }[];
  parameters?: { type: 'text' | 'currency' | 'date_time' | 'image' }[];
}

export interface SendMessageResponse {
  messaging_product: string;
  contacts: { wa_id: string; input: string }[];
  messages: { id: string }[];
}

// ============================================
// Webhook Verification Handler
// ============================================

export function handleWebhookVerification(
  query: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string },
  config: WhatsAppConfig
): { valid: boolean; challenge?: string } {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode === 'subscribe' && token === config.verifyToken) {
    return { valid: true, challenge };
  }

  return { valid: false };
}

// ============================================
// Message Processing
// ============================================

/**
 * Process incoming webhook payload
 */
export async function processWebhookPayload(
  body: WebhookBody,
  getTenantByPhoneNumberId: (phoneNumberId: string) => Promise<TenantInfo | null>,
  handlers: {
    handleIncomingMessage: (message: WebhookMessage, tenant: TenantInfo, timestamp: Date) => Promise<void>;
    handleStatusUpdate: (status: WebhookStatus, tenant: TenantInfo) => Promise<void>;
    handleError: (error: WhatsAppError, phoneNumberId: string) => Promise<void>;
  }
): Promise<void> {
  for (const entry of body.entry) {
    for (const change of entry.changes) {
      const { metadata, messages, statuses, errors } = change.value;
      const phoneNumberId = metadata.phone_number_id;

      // Route to correct tenant by phone_number_id
      const tenantInfo = await getTenantByPhoneNumberId(phoneNumberId);
      if (!tenantInfo) {
        console.log('Unknown phone number:', phoneNumberId);
        continue;
      }

      // Handle messages
      if (messages?.length) {
        for (const message of messages) {
          const timestamp = new Date(parseInt(message.timestamp) * 1000);
          await handlers.handleIncomingMessage(message, tenantInfo, timestamp);
        }
      }

      // Handle status updates
      if (statuses?.length) {
        for (const status of statuses) {
          await handlers.handleStatusUpdate(status, tenantInfo);
        }
      }

      // Handle errors
      if (errors?.length) {
        for (const error of errors) {
          await handlers.handleError(error, phoneNumberId);
        }
      }
    }
  }
}

// ============================================
// Message Type Handlers
// ============================================

export function isStopKeyword(text: string): boolean {
  const stopKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'STOP ALL', 'QUIT'];
  return stopKeywords.includes(text.trim().toUpperCase());
}

export function parseMessageType(type: string): MessageType {
  const typeMap: Record<string, MessageType> = {
    text: 'text',
    image: 'image',
    audio: 'audio',
    video: 'video',
    document: 'document',
    sticker: 'sticker',
    location: 'location',
    contacts: 'contacts',
    interactive: 'interactive',
    button: 'button',
    reaction: 'reaction',
    context: 'context',
  };
  return typeMap[type] || 'text';
}

export interface ParsedMessage {
  type: MessageType;
  body: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: ContactCard[];
  interactiveType?: string;
  interactiveId?: string;
  interactiveTitle?: string;
  buttonPayload?: string;
  reaction?: string;
  repliedToId?: string;
}

/**
 * Parse incoming message into structured format
 */
export function parseIncomingMessage(message: WebhookMessage): ParsedMessage {
  const base: ParsedMessage = {
    type: parseMessageType(message.type),
    body: '',
  };

  switch (message.type) {
    case 'text':
      base.body = message.text?.body || '';
      break;

    case 'image':
    case 'audio':
    case 'video':
    case 'document':
      base.mediaId = message[message.type]?.id;
      base.mediaMimeType = message[message.type]?.mime_type;
      base.mediaCaption = message[message.type]?.caption;
      base.body = message[message.type]?.caption || '';
      break;

    case 'location':
      base.location = {
        latitude: message.location?.latitude || 0,
        longitude: message.location?.longitude || 0,
        name: message.location?.name,
        address: message.location?.address,
      };
      base.body = `Location: ${message.location?.name || 'Unknown'}, ${message.location?.address || ''}`;
      break;

    case 'contacts':
      base.contacts = message.contacts;
      base.body = `Contact: ${message.contacts?.[0]?.name?.formatted_name || 'Unknown'}`;
      break;

    case 'interactive':
      base.interactiveType = message.interactive?.type;
      if (message.interactive?.button_reply) {
        base.interactiveType = 'button_reply';
        base.interactiveId = message.interactive.button_reply.id;
        base.interactiveTitle = message.interactive.button_reply.title;
      } else if (message.interactive?.list_reply) {
        base.interactiveType = 'list_reply';
        base.interactiveId = message.interactive.list_reply.id;
        base.interactiveTitle = message.interactive.list_reply.title;
        base.body = message.interactive.list_reply.description || '';
      }
      break;

    case 'button':
      base.buttonPayload = message.button?.payload;
      base.body = `Button: ${message.button?.text}`;
      break;

    case 'reaction':
      base.reaction = message.reaction?.emoji;
      base.repliedToId = message.reaction?.message_id;
      break;

    case 'context':
      base.repliedToId = message.context?.id;
      break;
  }

  return base;
}

// ============================================
// WhatsApp Graph API Client
// ============================================

export class WhatsAppAPIClient {
  constructor(private config: WhatsAppConfig) {}

  private get baseUrl(): string {
    return `${this.config.graphApiBase}/${this.config.apiVersion}`;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Send a text message
   */
  async sendTextMessage(
    to: string,
    text: string,
    phoneNumberId?: string
  ): Promise<SendMessageResponse> {
    if (this.config.mockMode) {
      return this.mockSendMessage(to, 'text');
    }

    const response = await fetch(
      `${this.baseUrl}/${phoneNumberId || this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Send an image message
   */
  async sendImageMessage(
    to: string,
    imageIdOrLink: string,
    caption?: string,
    phoneNumberId?: string
  ): Promise<SendMessageResponse> {
    if (this.config.mockMode) {
      return this.mockSendMessage(to, 'image');
    }

    const imagePayload = imageIdOrLink.startsWith('http')
      ? { link: imageIdOrLink, caption }
      : { id: imageIdOrLink, caption };

    const response = await fetch(
      `${this.baseUrl}/${phoneNumberId || this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'image',
          image: imagePayload,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Send interactive buttons message
   */
  async sendInteractiveButtons(
    to: string,
    header: string,
    body: string,
    buttons: { type: 'quick_reply' | 'url'; text: string; payload?: string; url?: string }[],
    phoneNumberId?: string
  ): Promise<SendMessageResponse> {
    if (this.config.mockMode) {
      return this.mockSendMessage(to, 'interactive');
    }

    const response = await fetch(
      `${this.baseUrl}/${phoneNumberId || this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            header: { type: 'text', text: header },
            body: { text: body },
            action: {
              buttons: buttons.map((btn) => ({
                type: btn.type,
                ...(btn.type === 'quick_reply' ? { reply: { title: btn.text, id: btn.payload } } : {}),
                ...(btn.type === 'url' ? { url: btn.url } : {}),
              })),
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Send a template message
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components: TemplateComponent[],
    phoneNumberId?: string
  ): Promise<SendMessageResponse> {
    if (this.config.mockMode) {
      return this.mockSendMessage(to, 'template');
    }

    const response = await fetch(
      `${this.baseUrl}/${phoneNumberId || this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string, phoneNumberId?: string): Promise<void> {
    if (this.config.mockMode) {
      return;
    }

    const response = await fetch(
      `${this.baseUrl}/${phoneNumberId || this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${error}`);
    }
  }

  /**
   * Get media URL
   */
  async getMediaUrl(mediaId: string): Promise<string> {
    if (this.config.mockMode) {
      return 'https://example.com/mock-media.jpg';
    }

    const response = await fetch(`${this.baseUrl}/${mediaId}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to get media URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.url;
  }

  /**
   * Download media content
   */
  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    if (this.config.mockMode) {
      return Buffer.from('mock-media-content');
    }

    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Create a payment link for WhatsApp Business
   */
  async createPaymentLink(amount: number, currency: string): Promise<string> {
    if (this.config.mockMode) {
      return `https://pay.example.com/mock-${Date.now()}`;
    }

    // Note: This would use Meta's Commerce API
    // Implementation depends on your specific use case
    throw new Error('Payment links require additional Meta Business API setup');
  }

  // ============================================
  // Mock helpers for development
  // ============================================

  private mockSendMessage(
    to: string,
    type: string
  ): SendMessageResponse {
    console.log(`[MOCK] Sending ${type} message to ${to}`);
    return {
      messaging_product: 'whatsapp',
      contacts: [{ wa_id: to, input: to }],
      messages: [{ id: `mock_${Date.now()}` }],
    };
  }
}

// ============================================
// Default Configuration
// ============================================

export function getDefaultConfig(): WhatsAppConfig {
  return {
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'your-verify-token',
    accessToken: process.env.META_ACCESS_TOKEN || '',
    graphApiBase: 'https://graph.facebook.com',
    apiVersion: 'v18.0',
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
    mockMode: process.env.WHATSAPP_MOCK_MODE === 'true',
  };
}

// ============================================
// Quick Reply Templates
// ============================================

export const QUICK_REPLY_TEMPLATES = {
  greeting: {
    header: 'Welcome! 👋',
    body: 'How can we help you today?',
    buttons: [
      { type: 'quick_reply' as const, text: '📦 Order Status', payload: 'order_status' },
      { type: 'quick_reply' as const, text: '💬 Chat with Agent', payload: 'chat_agent' },
      { type: 'quick_reply' as const, text: '📋 FAQ', payload: 'faq' },
    ],
  },
  orderStatus: {
    header: 'Order Status 🔍',
    body: 'Please enter your order number:',
    buttons: [],
  },
  satisfaction: {
    header: 'How was your experience?',
    body: 'Were you satisfied with our service?',
    buttons: [
      { type: 'quick_reply' as const, text: '😊 Very Satisfied', payload: 'satisfied' },
      { type: 'quick_reply' as const, text: '😐 Neutral', payload: 'neutral' },
      { type: 'quick_reply' as const, text: '😞 Not Satisfied', payload: 'unsatisfied' },
    ],
  },
};

// ============================================
// Status Message Mapping
// ============================================

export const STATUS_MESSAGES: Record<string, string> = {
  sent: 'Message sent',
  delivered: 'Message delivered',
  read: 'Message read',
  failed: 'Message delivery failed',
  pending: 'Message pending',
};

export function getStatusMessage(status: string): string {
  return STATUS_MESSAGES[status] || status;
}
