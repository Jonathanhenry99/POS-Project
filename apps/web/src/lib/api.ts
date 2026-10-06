import { appStore } from './state';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  /** true bila gagal karena jaringan/server, bukan karena data ditolak. */
  get retryable() {
    return this.status === 0 || this.status === 401 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export function authHeaders(operatorId?: string): Record<string, string> {
  const s = appStore.get();
  if (s.mode === 'tablet' && s.device) {
    const h: Record<string, string> = { Authorization: `Device ${s.device.token}` };
    const op = operatorId ?? s.user?.id;
    if (op) h['X-Operator'] = op;
    return h;
  }
  return s.token ? { Authorization: `Bearer ${s.token}` } : {};
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; operatorId?: string; timeoutMs?: number; raw?: boolean } = {},
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        ...authHeaders(opts.operatorId),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, 'Tidak terhubung ke server. Periksa internet.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let message = res.status >= 502 && res.status <= 504 ? 'Server tidak merespons. Coba lagi sebentar lagi.' : `Gagal (${res.status})`;
    try {
      message = (await res.json()).error ?? message;
    } catch {
      /* respons bukan JSON */
    }
    if (res.status === 401 && appStore.get().mode === 'online') onUnauthorized?.();
    throw new ApiError(res.status, message);
  }
  if (opts.raw) return res as T;
  return (await res.json()) as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
