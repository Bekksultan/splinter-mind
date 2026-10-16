/**
 * Structured JSON logging for edge functions.
 * Every log line carries a timestamp and optional traceable ids
 * (event_id / alert_id / rule_id) so one event's journey can be followed.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  event_id?: string | null;
  alert_id?: string | null;
  rule_id?: string | null;
  org_id?: string | null;
  [key: string]: unknown;
}

export function log(level: LogLevel, message: string, ctx: LogContext = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...ctx,
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}
