import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db, resetDbForTests } from '../lib/idb';
import { DEFAULT_PRINTER_CONFIG } from './types';
import { cancelPrintJob, claimPrintJob, finishPrintJob, listPrintJobs, makePrintJob, storePrintJobs } from './queue';
beforeEach(resetDbForTests);
const job = () => makePrintJob('Struk A', [{ kind: 'text', text: 'PESANAN' }], { id: 'kasir', name: 'Kasir', config: { ...DEFAULT_PRINTER_CONFIG, bridgeToken: 'local-token' } });
it('menyimpan dokumen/config tanpa token, terpisah dari transaksi/outbox', async () => {
  const j = job(); await storePrintJobs([j]);
  expect((await listPrintJobs())[0].config.bridgeToken).toBeUndefined();
  expect((await listPrintJobs())[0].ops).toEqual(j.ops);
  expect(await (await db()).count('orders')).toBe(0); expect(await (await db()).count('outbox')).toBe(0);
});
it('dua klaim paralel menghasilkan satu pengirim dan tidak menggandakan job', async () => {
  const j = job(); await storePrintJobs([j]);
  const result = await Promise.allSettled([claimPrintJob(j.id), claimPrintJob(j.id)]);
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await listPrintJobs())[0].attempts).toBe(1);
});
it('job yang terputus hanya dapat dikirim lagi setelah konfirmasi risiko duplikat', async () => {
  const j = { ...job(), state: 'sending' as const, updatedAt: new Date(Date.now() - 120_000).toISOString() }; await storePrintJobs([j]);
  await expect(claimPrintJob(j.id)).rejects.toThrow('Konfirmasi');
  const claimed = await claimPrintJob(j.id, true); await finishPrintJob(claimed, 'handed-off', 'RawBT');
  await expect(claimPrintJob(j.id)).rejects.toThrow('Konfirmasi');
  expect((await listPrintJobs())[0].state).toBe('handed-off');
});
it('pembatalan antrean tidak menghapus dokumen/transaksi dan tidak boleh menginterupsi pengiriman', async () => {
  const j = job(); await storePrintJobs([j]); await claimPrintJob(j.id);
  await expect(cancelPrintJob(j.id)).rejects.toThrow('Tunggu');
  await finishPrintJob(j, 'failed', 'printer tidak tersedia'); await cancelPrintJob(j.id);
  await expect(claimPrintJob(j.id)).rejects.toThrow('dibatalkan');
  expect((await listPrintJobs())[0].ops).toEqual(j.ops);
});
