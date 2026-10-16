/**
 * Splinter Mind — provider interfaces and implementations.
 *
 * CameraProvider  — camera/NVR vendors behind one interface (Hikvision today,
 *                   others later). Real network calls live ONLY in
 *                   HikvisionProvider; everything else uses mocks in dev/demo.
 * VisionAnalyzer  — AI vision behind one interface (mock in dev; real
 *                   openai-compatible provider only via env).
 * NotificationProvider — push + (stubbed) WhatsApp behind one interface.
 *
 * Security: credentials are passed in (constructor / method args) and are
 * NEVER logged, NEVER returned to callers, NEVER stored in the mobile app.
 */

import type {
  CameraProviderName,
  CameraStatus,
  EventType,
  VisionAnalysis,
} from './types.ts';

// ---------------------------------------------------------------------------
// Shared HTTP helpers: timeout + retry + graceful failure
// ---------------------------------------------------------------------------

export interface RetryOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

/**
 * fetch with per-attempt timeout and exponential-backoff retries on network
 * errors. HTTP error statuses are NOT retried here (callers decide).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const { timeoutMs = 8000, retries = 2, backoffMs = 500 } = opts;
  let lastError: unknown = new Error('fetch failed with no attempts');
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`fetch failed: ${String(lastError)}`);
}

// ---------------------------------------------------------------------------
// CameraProvider
// ---------------------------------------------------------------------------

export interface CameraRef {
  id: string;
  external_id: string | null;
  provider: CameraProviderName;
  configuration: Record<string, unknown> | null;
  branch_id: string;
}

export interface ProviderCredentials {
  host: string;
  port?: number;
  useHttps?: boolean;
  username: string;
  password: string;
}

export interface CameraStatusResult {
  status: CameraStatus;
  last_seen_at: string;
  detail?: string;
}

export interface DeviceInfo {
  external_id: string;
  name: string;
  model?: string;
}

export interface CameraProvider {
  readonly name: string;
  getStatus(camera: CameraRef): Promise<CameraStatusResult>;
  getSnapshot(camera: CameraRef): Promise<{ imageBytes: Uint8Array; contentType: string }>;
  getRecording(camera: CameraRef, from: string, to: string): Promise<{ videoUrl: string } | null>;
  listDevices(credentials: ProviderCredentials): Promise<DeviceInfo[]>;
}

// ---------------------------------------------------------------------------
// MD5 (compact, for HTTP Digest auth against Hikvision ISAPI)
// ---------------------------------------------------------------------------

const MD5_S: number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_K: number[] = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/** MD5 hex digest. Used only for HTTP Digest auth (Hikvision ISAPI). */
export function md5Hex(message: string): string {
  const msg = Array.from(new TextEncoder().encode(message));
  const origBitLen = msg.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  const lo = origBitLen >>> 0;
  const hi = Math.floor(origBitLen / 2 ** 32) >>> 0;
  for (const v of [lo, hi]) for (let i = 0; i < 4; i++) msg.push((v >>> (i * 8)) & 0xff);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let off = 0; off < msg.length; off += 64) {
    const M: number[] = [];
    for (let i = 0; i < 16; i++) {
      M.push(
        (msg[off + i * 4]! | (msg[off + i * 4 + 1]! << 8) | (msg[off + i * 4 + 2]! << 16) | (msg[off + i * 4 + 3]! << 24)) >>> 0,
      );
    }
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + MD5_K[i]! + M[g]!) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(f, MD5_S[i]!)) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const word = (w: number): string =>
    [0, 8, 16, 24].map((s) => ((w >>> s) & 0xff).toString(16).padStart(2, '0')).join('');
  return word(a0) + word(b0) + word(c0) + word(d0);
}

function parseDigestChallenge(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  const re = /(\w+)=("([^"]+)"|([^\s,]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header)) !== null) params[m[1]!] = m[3] ?? m[4]!;
  return params;
}

function digestAuthHeader(
  method: string,
  uri: string,
  challenge: Record<string, string>,
  username: string,
  password: string,
): string {
  const realm = challenge['realm'] ?? '';
  const nonce = challenge['nonce'] ?? '';
  const qop = (challenge['qop'] ?? 'auth').split(',')[0]!.trim();
  const opaque = challenge['opaque'];
  const cnonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const nc = '00000001';
  const ha1 = md5Hex(`${username}:${realm}:${password}`);
  const ha2 = md5Hex(`${method}:${uri}`);
  const response = md5Hex(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  let h =
    `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", ` +
    `response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (opaque) h += `, opaque="${opaque}"`;
  return h;
}

// ---------------------------------------------------------------------------
// HikvisionProvider — ISAPI behind the CameraProvider interface.
// Credentials are supplied via the constructor (server-side only) and are
// NEVER logged. All calls have timeouts + one retry; failures degrade to
// 'offline'/'unknown' instead of throwing, except snapshot which throws so
// callers can fall back to "snapshot unavailable".
// ---------------------------------------------------------------------------

export interface HikvisionProviderOptions {
  timeoutMs?: number;
}

export class HikvisionProvider implements CameraProvider {
  readonly name = 'hikvision';
  private readonly timeoutMs: number;

  /**
   * @param creds device/NVR credentials — server-side only (env / Vault).
   * Never logged, never serialized, never sent anywhere except the device.
   */
  constructor(
    private readonly creds: ProviderCredentials,
    opts: HikvisionProviderOptions = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 8000;
  }

  private baseUrl(): string {
    const scheme = this.creds.useHttps ? 'https' : 'http';
    const port = this.creds.port ?? (this.creds.useHttps ? 443 : 80);
    return `${scheme}://${this.creds.host}:${port}`;
  }

  private channelOf(camera: CameraRef): number {
    const raw = camera.configuration?.['channel'];
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '101'), 10);
    return Number.isFinite(n) ? n : 101;
  }

  /** GET against ISAPI with digest-auth handshake, timeout and one retry. */
  private async isapiGet(path: string): Promise<Response> {
    const url = `${this.baseUrl()}${path}`;
    const attempt = async (authHeader?: string): Promise<Response> => {
      const headers: Record<string, string> = {};
      if (authHeader) headers['Authorization'] = authHeader;
      return fetchWithRetry(
        url,
        { method: 'GET', headers },
        { timeoutMs: this.timeoutMs, retries: 1 },
      );
    };
    let res = await attempt();
    if (res.status === 401) {
      const www = res.headers.get('www-authenticate') ?? '';
      if (/digest/i.test(www)) {
        const authHeader = digestAuthHeader(
          'GET',
          path,
          parseDigestChallenge(www),
          this.creds.username,
          this.creds.password,
        );
        res = await attempt(authHeader);
      }
    }
    return res;
  }

  async getStatus(camera: CameraRef): Promise<CameraStatusResult> {
    const now = new Date().toISOString();
    try {
      const res = await this.isapiGet('/ISAPI/System/deviceInfo');
      if (res.ok) return { status: 'online', last_seen_at: now };
      if (res.status === 401 || res.status === 403) {
        return { status: 'degraded', last_seen_at: now, detail: `auth rejected (${res.status})` };
      }
      return { status: 'degraded', last_seen_at: now, detail: `http ${res.status}` };
    } catch (err) {
      return {
        status: 'offline',
        last_seen_at: now,
        detail: err instanceof Error ? err.message : 'unreachable',
      };
    }
  }

  async getSnapshot(camera: CameraRef): Promise<{ imageBytes: Uint8Array; contentType: string }> {
    const channel = this.channelOf(camera);
    const res = await this.isapiGet(`/ISAPI/Streaming/channels/${channel}/picture`);
    if (!res.ok) throw new Error(`snapshot failed: http ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('snapshot failed: empty body');
    return {
      imageBytes: buf,
      contentType: res.headers.get('content-type') ?? 'image/jpeg',
    };
  }

  async getRecording(
    _camera: CameraRef,
    _from: string,
    _to: string,
  ): Promise<{ videoUrl: string } | null> {
    // MVP skeleton: playback-URI download is device/firmware specific and is
    // resolved per deployment. Returning null signals "not supported here".
    return null;
  }

  async listDevices(_credentials: ProviderCredentials): Promise<DeviceInfo[]> {
    // MVP skeleton: NVR channel enumeration (/ISAPI/ContentMgmt/InputProxy/channels)
    // is wired per deployment. Cameras are registered explicitly for now.
    return [];
  }
}

// ---------------------------------------------------------------------------
// MockHikvisionProvider — deterministic, hardware-free demo/dev provider.
// ---------------------------------------------------------------------------

/** 1x1 transparent PNG, used as the canned mock snapshot. */
const MOCK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function mockPngBytes(): Uint8Array {
  const bin = atob(MOCK_PNG_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class MockHikvisionProvider implements CameraProvider {
  readonly name = 'mock';
  private offlineCameras = new Set<string>();

  /** Test/demo hook: force a camera to report offline. */
  setOffline(externalId: string, offline = true): void {
    if (offline) this.offlineCameras.add(externalId);
    else this.offlineCameras.delete(externalId);
  }

  async getStatus(camera: CameraRef): Promise<CameraStatusResult> {
    const key = camera.external_id ?? camera.id;
    if (this.offlineCameras.has(key)) {
      return { status: 'offline', last_seen_at: new Date(Date.now() - 20 * 60_000).toISOString() };
    }
    return { status: 'online', last_seen_at: new Date().toISOString() };
  }

  async getSnapshot(_camera: CameraRef): Promise<{ imageBytes: Uint8Array; contentType: string }> {
    return { imageBytes: mockPngBytes(), contentType: 'image/png' };
  }

  async getRecording(
    _camera: CameraRef,
    _from: string,
    _to: string,
  ): Promise<{ videoUrl: string } | null> {
    return null;
  }

  async listDevices(_credentials: ProviderCredentials): Promise<DeviceInfo[]> {
    return [
      { external_id: 'mock-cam-1', name: 'Entrance (mock)', model: 'MockVision 4K' },
      { external_id: 'mock-cam-2', name: 'Cashier Area (mock)', model: 'MockVision 4K' },
    ];
  }
}

// ---------------------------------------------------------------------------
// VisionAnalyzer
// ---------------------------------------------------------------------------

export interface VisionContext {
  branch_name?: string;
  camera_name?: string;
  event_type: EventType;
  timestamp: string;
  outside_working_hours?: boolean;
  /** free-text hint (demo/simulate only) steering the deterministic mock */
  hint?: string;
}

export interface VisionAnalyzer {
  analyzeImage(
    image: { url: string } | { bytes: Uint8Array },
    context: VisionContext,
  ): Promise<VisionAnalysis>;
}

/**
 * Deterministic mock analyzer (AI mock mode, ARCHITECTURE.md §36).
 * Output is a pure function of the hint/event type — no randomness, no cost.
 * Neutral language only.
 */
export class MockVisionAnalyzer implements VisionAnalyzer {
  async analyzeImage(
    _image: { url: string } | { bytes: Uint8Array },
    context: VisionContext,
  ): Promise<VisionAnalysis> {
    const hint = (context.hint ?? '').toLowerCase();
    const person =
      hint.includes('person') ||
      hint.includes('intrusion') ||
      context.event_type === 'person_detected' ||
      context.event_type === 'intrusion';
    const restricted =
      hint.includes('restricted') ||
      context.event_type === 'restricted_area' ||
      context.event_type === 'intrusion';
    const empty = hint.includes('empty') || hint.includes('false positive');

    // deterministic confidence from hint text (stable across runs)
    let h = 0;
    for (let i = 0; i < hint.length; i++) h = (h * 31 + hint.charCodeAt(i)) >>> 0;
    const confidence = empty ? 0.12 : 0.7 + ((h % 26) / 100);

    const risk_level: VisionAnalysis['risk_level'] = empty
      ? 'low'
      : person && restricted
        ? 'high'
        : person
          ? 'medium'
          : 'low';

    const where = context.camera_name ?? 'the monitored area';
    return {
      person_detected: person && !empty,
      restricted_area: restricted && !empty,
      outside_working_hours: context.outside_working_hours ?? false,
      confidence: Math.round(confidence * 100) / 100,
      risk_level,
      summary: empty
        ? `No person or unusual activity observed in ${where}. This looks like a false positive.`
        : person
          ? `A person appears to be present in ${where}${context.outside_working_hours ? ' outside working hours' : ''}. Potentially suspicious event requiring human review.`
          : `No person detected in ${where}. Nothing unusual observed.`,
      objects_visible: person && !empty ? ['person'] : [],
      likely_false_positive: empty,
    };
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

/**
 * OpenAI-compatible vision provider skeleton (real AI path).
 * Enabled only when VISION_PROVIDER=openai-compatible and VISION_API_KEY is set;
 * otherwise construct MockVisionAnalyzer. Never used implicitly.
 */
export class OpenAICompatibleVisionAnalyzer implements VisionAnalyzer {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async analyzeImage(
    image: { url: string } | { bytes: Uint8Array },
    context: VisionContext,
  ): Promise<VisionAnalysis> {
    const imageUrl =
      'url' in image ? image.url : `data:image/jpeg;base64,${bytesToBase64(image.bytes)}`;
    const prompt =
      'Analyze this security camera frame as an operations assistant. ' +
      'Return ONLY valid JSON with keys: person_detected (bool), restricted_area (bool), ' +
      'outside_working_hours (bool), confidence (0..1), risk_level (critical|high|medium|low|info), ' +
      'summary (string, neutral language, never accuse anyone), objects_visible (string[]), ' +
      'likely_false_positive (bool). ' +
      `Context: event=${context.event_type}, branch=${context.branch_name ?? 'unknown'}, ` +
      `camera=${context.camera_name ?? 'unknown'}, outside_working_hours=${context.outside_working_hours ?? false}.`;

    const res = await fetchWithRetry(
      this.apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 400,
        }),
      },
      { timeoutMs: 20000, retries: 1 },
    );
    if (!res.ok) throw new Error(`vision provider http ${res.status}`);
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as VisionAnalysis;
    if (typeof parsed.confidence !== 'number' || typeof parsed.summary !== 'string') {
      throw new Error('vision provider returned malformed analysis');
    }
    return parsed;
  }
}

// ---------------------------------------------------------------------------
// NotificationProvider
// ---------------------------------------------------------------------------

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SendResult {
  ok: boolean;
  delivered?: number;
  error?: string;
}

export interface NotificationProvider {
  sendPush(tokens: string[], message: PushMessage): Promise<SendResult>;
  sendWhatsApp?(to: string, text: string): Promise<SendResult>;
}

/** In-memory mock: records what would have been sent (assertable in tests). */
export class MockNotificationProvider implements NotificationProvider {
  readonly sentPush: Array<{ tokens: string[]; message: PushMessage }> = [];
  readonly sentWhatsApp: Array<{ to: string; text: string }> = [];

  async sendPush(tokens: string[], message: PushMessage): Promise<SendResult> {
    this.sentPush.push({ tokens, message });
    return { ok: true, delivered: tokens.length };
  }

  async sendWhatsApp(to: string, text: string): Promise<SendResult> {
    this.sentWhatsApp.push({ to, text });
    // MVP: WhatsApp is an optional channel, stubbed until a provider is wired.
    return { ok: false, error: 'whatsapp_not_configured' };
  }
}
