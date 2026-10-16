/**
 * Splinter Mind — WhatsApp Business Cloud API provider.
 *
 * Sends alert notifications as APPROVED TEMPLATE messages via Meta's
 * WhatsApp Business Cloud API. Business-initiated messages REQUIRE a
 * template — free-text messaging is forbidden by the API outside the
 * 24-hour customer-service window, so a failed template send is returned
 * as an error and NEVER retried as free text.
 *
 * Security: credentials (token, phone_number_id) are passed via the
 * constructor (server-side env / Vault only) and are NEVER logged,
 * NEVER serialized, NEVER stored in the mobile app.
 */

import {
  fetchWithRetry,
  type NotificationProvider,
  type PushMessage,
  type RetryOptions,
  type SendResult,
} from './providers.ts';
import type { Severity } from './types.ts';

export interface WhatsAppCredentials {
  /** Meta system-user access token — server-side only. */
  token: string;
  /** WhatsApp Business phone_number_id that sends the messages. */
  phoneNumberId: string;
}

export interface WhatsAppTemplate {
  /** Approved template name, e.g. 'splinter_alert'. */
  name: string;
  /** Template language code, e.g. 'en_US'. */
  language?: string;
}

/** Structured alert content mapped onto the template's body parameters. */
export interface WhatsAppAlertParams {
  severity: Severity;
  branchName: string;
  title: string;
  /** ISO-8601 timestamp of the alert. */
  timestamp: string;
}

export interface WhatsAppTemplateResult extends SendResult {
  /** WhatsApp message id (wamid) when the send was accepted. */
  messageId?: string;
}

/**
 * Minimal structural interface for the alert-template sender, so edge
 * functions and tests can depend on it without the full provider.
 */
export interface WhatsAppAlertSender {
  sendAlertTemplate(to: string, params: WhatsAppAlertParams): Promise<WhatsAppTemplateResult>;
}

/** Template body parameter order — must match the approved template. */
export const WHATSAPP_TEMPLATE_PARAMS = ['severity', 'branchName', 'title', 'timestamp'] as const;

const E164_RE = /^\+\d{7,15}$/;

/** Default template name; override via WHATSAPP_TEMPLATE_NAME. */
export const DEFAULT_WHATSAPP_TEMPLATE_NAME = 'splinter_alert';

export class WhatsAppCloudApiProvider implements NotificationProvider, WhatsAppAlertSender {
  readonly name = 'whatsapp-cloud-api';

  constructor(
    private readonly creds: WhatsAppCredentials,
    private readonly template: WhatsAppTemplate = { name: DEFAULT_WHATSAPP_TEMPLATE_NAME },
    private readonly opts: RetryOptions = {},
  ) {}

  private endpoint(): string {
    return `https://graph.facebook.com/v19.0/${this.creds.phoneNumberId}/messages`;
  }

  /**
   * Sends the approved alert template. Parameter order: severity, branch
   * name, alert title, timestamp (see WHATSAPP_TEMPLATE_PARAMS).
   * Never falls back to free text.
   */
  async sendAlertTemplate(to: string, params: WhatsAppAlertParams): Promise<WhatsAppTemplateResult> {
    if (!E164_RE.test(to)) {
      return { ok: false, error: 'invalid recipient: expected E.164 format (e.g. +996555123456)' };
    }
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: this.template.name,
        language: { code: this.template.language ?? 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: params.severity.toUpperCase() },
              { type: 'text', text: params.branchName },
              { type: 'text', text: params.title },
              { type: 'text', text: params.timestamp },
            ],
          },
        ],
      },
    };

    let res: Response;
    try {
      res = await fetchWithRetry(
        this.endpoint(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // The token lives only in this header; it is never logged.
            Authorization: `Bearer ${this.creds.token}`,
          },
          body: JSON.stringify(body),
        },
        { timeoutMs: this.opts.timeoutMs ?? 10000, retries: this.opts.retries ?? 2 },
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (!res.ok) {
      // Business-initiated messages REQUIRE a template: no free-text fallback.
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `whatsapp template send failed: http ${res.status} ${detail.slice(0, 300)}`.trim() };
    }
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
    };
    return { ok: true, delivered: 1, messageId: data.messages?.[0]?.id };
  }

  // -- NotificationProvider conformance -----------------------------------

  async sendPush(_tokens: string[], _message: PushMessage): Promise<SendResult> {
    return { ok: false, error: 'whatsapp provider cannot send push notifications' };
  }

  /**
   * Free-text entry point required by the interface. It is mapped onto the
   * approved template (text becomes the title) — raw free-text messages are
   * never sent, because business-initiated WhatsApp messages require a
   * template outside the 24h customer-service window.
   */
  async sendWhatsApp(to: string, text: string): Promise<SendResult> {
    return this.sendAlertTemplate(to, {
      severity: 'info',
      branchName: '',
      title: text,
      timestamp: new Date().toISOString(),
    });
  }
}

/** E.164 validation shared by callers (mobile validates on input too). */
export function isValidE164(phone: string): boolean {
  return E164_RE.test(phone);
}
