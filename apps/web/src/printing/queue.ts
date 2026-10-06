import type { ReceiptOp } from '@mourden/shared';
import { db } from '../lib/idb';
import { uuid } from '../lib/id';
import type { PrinterConfig } from './types';

export interface PrintJob {
  id: string;
  label: string;
  profileId: string;
  profileName: string;
  config: PrinterConfig;
  ops: ReceiptOp[];
  createdAt: string;
  updatedAt: string;
  state: 'queued' | 'sending' | 'handed-off' | 'failed' | 'uncertain' | 'cancelled';
  message: string;
  attempts: number;
}

export function makePrintJob(label: string, ops: ReceiptOp[], profile: { id: string; name: string; config: PrinterConfig }): PrintJob {
  const now = new Date().toISOString();
  // Token bridge tetap berada di profil lokal; tidak disalin ke arsip job/cetakan.
  const { bridgeToken: _, ...config } = profile.config;
  return { id: uuid(), label, ops, profileId: profile.id, profileName: profile.name, config, createdAt: now, updatedAt: now, state: 'queued', message: '', attempts: 0 };
}

export async function storePrintJobs(jobs: PrintJob[]) {
  const d = await db(); const tx = d.transaction('printJobs', 'readwrite');
  const prior = await tx.store.getAll();
  // Hanya job selesai yang boleh dipangkas; job belum selesai tidak hilang.
  const done = prior.filter((j) => j.state === 'handed-off' || j.state === 'cancelled').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const j of done.slice(200)) await tx.store.delete(j.id);
  for (const j of jobs) await tx.store.put(j);
  await tx.done;
}

export async function listPrintJobs() {
  return (await (await db()).getAll('printJobs')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Klaim atomik mencegah dua tab mengirim job yang sama bersamaan. Tidak ada retry otomatis. */
export async function claimPrintJob(id: string, acknowledgeDuplicate = false): Promise<PrintJob> {
  const d = await db(); const tx = d.transaction('printJobs', 'readwrite');
  const job = await tx.store.get(id);
  if (!job) { await tx.done; throw new Error('Antrean cetak tidak ditemukan'); }
  if (job.state === 'cancelled') { await tx.done; throw new Error('Job sudah dibatalkan'); }
  if (job.state === 'sending' && Date.now() - Date.parse(job.updatedAt) < 60_000) { await tx.done; throw new Error('Job sedang dikirim. Tunggu hingga satu menit sebelum memeriksa ulang.'); }
  if (['sending', 'uncertain', 'handed-off'].includes(job.state) && !acknowledgeDuplicate) { await tx.done; throw new Error('Hasil cetak belum bisa dipastikan. Konfirmasi risiko cetak ganda sebelum mengirim ulang.'); }
  const next: PrintJob = { ...job, state: 'sending', updatedAt: new Date().toISOString(), attempts: job.attempts + 1, message: '' };
  await tx.store.put(next); await tx.done; return next;
}

export async function finishPrintJob(job: PrintJob, state: PrintJob['state'], message: string) {
  await (await db()).put('printJobs', { ...job, state, message, updatedAt: new Date().toISOString() });
}

export async function cancelPrintJob(id: string) {
  const d = await db(); const tx = d.transaction('printJobs', 'readwrite'); const job = await tx.store.get(id);
  if (!job) { await tx.done; return; }
  if (job.state === 'sending') { await tx.done; throw new Error('Tunggu pengiriman selesai sebelum membatalkan antrean'); }
  await tx.store.put({ ...job, state: 'cancelled', updatedAt: new Date().toISOString() }); await tx.done;
}
