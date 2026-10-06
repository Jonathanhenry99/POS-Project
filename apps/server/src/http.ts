import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const notFound = (msg = 'Data tidak ditemukan') => new HttpError(404, msg);
export const forbidden = (msg = 'Tidak punya akses') => new HttpError(403, msg);

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw badRequest(`Data tidak valid: ${first.path.join('.') || '(root)'} ${first.message}`, r.error.issues);
  }
  return r.data;
}

/** Rentang tanggal YYYY-MM-DD dari query, default hari ini (zona waktu toko diterapkan di SQL). */
export const dateRangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  // Pelanggaran unique/foreign key Postgres
  if (err?.code === '23505') {
    res.status(409).json({ error: 'Data sudah ada (duplikat)' });
    return;
  }
  if (err?.code === '23503') {
    res.status(400).json({ error: 'Data terkait tidak ditemukan' });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON tidak valid' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server' });
};
