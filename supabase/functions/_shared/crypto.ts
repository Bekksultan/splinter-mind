/**
 * Webhook authentication: HMAC-SHA256 over the raw request body.
 * Uses WebCrypto (available in Deno and Node 18+). Constant-time compare.
 */

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify the `x-signature` header: hex(HMAC-SHA256(secret, rawBody)).
 * A leading "sha256=" prefix is tolerated.
 */
export async function verifyHmacSha256Hex(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!secret || !signatureHeader) return false;
  const provided = signatureHeader.replace(/^sha256=/i, '').toLowerCase();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return timingSafeEqual(toHex(new Uint8Array(mac)), provided);
}

/** Test/dev helper: compute the signature a legitimate sender would attach. */
export async function signHmacSha256Hex(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return toHex(new Uint8Array(mac));
}
