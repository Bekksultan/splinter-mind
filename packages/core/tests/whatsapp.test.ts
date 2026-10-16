import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WHATSAPP_TEMPLATE_NAME,
  WhatsAppCloudApiProvider,
  isValidE164,
  type WhatsAppAlertParams,
} from '../src/whatsapp.ts';

const CREDS = { token: 'test-token', phoneNumberId: '123456789' };
const PARAMS: WhatsAppAlertParams = {
  severity: 'critical',
  branchName: 'Branch #14',
  title: 'Security event detected',
  timestamp: '2026-10-16T02:17:00.000Z',
};

function mockFetchOnce(responder: () => Response): void {
  vi.stubGlobal('fetch', vi.fn(responder));
}

function okResponse(): Response {
  return new Response(JSON.stringify({ messages: [{ id: 'wamid.test123' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});
function lastCall(mock: { mock: { calls: unknown[][] } }): [string, RequestInit] {
  const calls = mock.mock.calls;
  const last = calls[calls.length - 1] as [string, RequestInit];
  if (!last) throw new Error('expected fetch to have been called');
  return last;
}


describe('isValidE164', () => {
  it('accepts valid E.164 numbers', () => {
    expect(isValidE164('+996555123456')).toBe(true);
    expect(isValidE164('+14155552671')).toBe(true);
  });
  it('rejects malformed numbers', () => {
    expect(isValidE164('996555123456')).toBe(false);
    expect(isValidE164('+996 555 123')).toBe(false);
    expect(isValidE164('+')).toBe(false);
    expect(isValidE164('')).toBe(false);
  });
});

describe('WhatsAppCloudApiProvider.sendAlertTemplate', () => {
  it('posts the template to the correct Cloud API URL with auth header', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const p = new WhatsAppCloudApiProvider(CREDS);

    const res = await p.sendAlertTemplate('+996555123456', PARAMS);

    expect(res.ok).toBe(true);
    expect(res.delivered).toBe(1);
    expect(res.messageId).toBe('wamid.test123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('https://graph.facebook.com/v19.0/123456789/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '+996555123456',
      type: 'template',
    });
    const template = body['template'] as Record<string, unknown>;
    expect(template['name']).toBe(DEFAULT_WHATSAPP_TEMPLATE_NAME);
    expect((template['language'] as Record<string, string>)['code']).toBe('en_US');
    const components = template['components'] as Array<{
      type: string;
      parameters: Array<{ type: string; text: string }>;
    }>;
    expect(components[0]?.type).toBe('body');
    // parameter order: severity, branch name, alert title, timestamp
    expect(components[0]?.parameters.map((pr) => pr.text)).toEqual([
      'CRITICAL',
      'Branch #14',
      'Security event detected',
      '2026-10-16T02:17:00.000Z',
    ]);
  });

  it('uses a custom template name when provided', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const p = new WhatsAppCloudApiProvider(CREDS, { name: 'custom_alert', language: 'ru' });
    await p.sendAlertTemplate('+996555123456', PARAMS);
    const [, init] = lastCall(fetchMock);
    const template = (JSON.parse(init.body as string) as Record<string, unknown>)['template'] as Record<string, unknown>;
    expect(template['name']).toBe('custom_alert');
    expect((template['language'] as Record<string, string>)['code']).toBe('ru');
  });

  it('maps HTTP errors to ok:false WITHOUT any free-text fallback', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'template not approved' } }), { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const p = new WhatsAppCloudApiProvider(CREDS);

    const res = await p.sendAlertTemplate('+996555123456', PARAMS);

    expect(res.ok).toBe(false);
    expect(res.error).toContain('400');
    // exactly one request: no free-text retry after a template failure
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps network failures to ok:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection reset');
      }),
    );
    const p = new WhatsAppCloudApiProvider(CREDS, undefined, { retries: 0 });
    const res = await p.sendAlertTemplate('+996555123456', PARAMS);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('connection reset');
  });

  it('rejects non-E.164 recipients without calling the API', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const p = new WhatsAppCloudApiProvider(CREDS);
    const res = await p.sendAlertTemplate('555123456', PARAMS);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('E.164');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('NotificationProvider conformance', () => {
  it('refuses push (wrong channel)', async () => {
    const p = new WhatsAppCloudApiProvider(CREDS);
    const res = await p.sendPush(['tok'], { title: 't', body: 'b' });
    expect(res.ok).toBe(false);
  });

  it('sendWhatsApp maps free text onto the template (never raw text)', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const p = new WhatsAppCloudApiProvider(CREDS);
    const res = await p.sendWhatsApp('+996555123456', 'hello');
    expect(res.ok).toBe(true);
    const [, init] = lastCall(fetchMock);
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['type']).toBe('template');
  });
});
