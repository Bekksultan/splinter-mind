/** Minimal HTTP helpers for edge-function handlers (no Deno APIs). */

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function badRequest(message: string, details?: unknown): Response {
  return json(400, details === undefined ? { error: message } : { error: message, details });
}

export type ReadJsonResult = { ok: true; value: unknown } | { ok: false; error: string };

export async function readJson(req: Request): Promise<ReadJsonResult> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, error: 'invalid JSON body' };
  }
}

export function getQueryParam(req: Request, name: string): string | null {
  try {
    return new URL(req.url).searchParams.get(name);
  } catch {
    return null;
  }
}
