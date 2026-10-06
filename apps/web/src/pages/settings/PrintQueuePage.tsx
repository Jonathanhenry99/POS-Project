import { useEffect, useState } from 'react';
import { formatDateTime, toPlainText } from '@mourden/shared';
import { Button, Card, Empty, ErrorNote } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';
import { errorMessage } from '../../lib/api';
import { useApp } from '../../lib/state';
import { cancelPrintJob, listPrintJobs, makePrintJob, storePrintJobs, type PrintJob } from '../../printing/queue';
import { printerProfilesStore, sendPrintJob } from '../../printing/service';
import { PrintStatusCard } from '../../components/PrintStatusCard';

const LABEL: Record<PrintJob['state'], string> = { queued: 'Menunggu kirim', sending: 'Pengiriman dimulai — periksa hasil', 'handed-off': 'Data diserahkan (periksa kertas)', failed: 'Gagal sebelum kirim', uncertain: 'Hasil belum pasti', cancelled: 'Antrean dibatalkan' };
export function PrintQueuePage() {
  const tz = useApp((s) => s.data?.settings.store.timezone ?? 'Asia/Jakarta');
  const [jobs, setJobs] = useState<PrintJob[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState<string | null>(null); const [preview, setPreview] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const load = async () => { try { setJobs(await listPrintJobs()); } catch (e) { setError(errorMessage(e)); } };
  useEffect(() => { void load(); }, []);
  const act = async (job: PrintJob, copy = false) => {
    const risk = copy || ['uncertain', 'sending', 'handed-off'].includes(job.state);
    if (risk && !await confirmDialog({ title: 'Periksa cetakan terlebih dahulu', message: 'Dokumen mungkin sudah tercetak. Kirim lagi hanya setelah memastikan; tindakan ini bisa menghasilkan salinan ganda.', confirmLabel: copy ? 'Buat salinan baru' : 'Kirim lagi' })) return;
    setBusy(job.id); setError('');
    try {
      let id = job.id;
      if (copy) {
        const profile = printerProfilesStore.get().list.find((p) => p.id === job.profileId);
        if (!profile) throw new Error('Profil printer tidak ditemukan');
        const next = makePrintJob(`Salinan · ${job.label}`, [{ kind: 'text', text: '*** SALINAN ***', bold: true, align: 'center' }, ...job.ops.filter((op) => op.kind !== 'drawer')], { ...profile, config: { ...job.config, bridgeToken: profile.config.bridgeToken } });
        await storePrintJobs([next]); id = next.id;
      }
      await sendPrintJob(id, risk);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); await load(); }
  };
  return <div className="h-full overflow-y-auto p-4"><div className="mx-auto flex max-w-5xl flex-col gap-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Antrean cetak</h1><Button variant="outline" onClick={() => void load()}>Muat ulang</Button></div><p className="text-sm text-fg-muted">Dokumen tersimpan di tablet, terpisah dari antrean sinkron transaksi. Tidak dikirim ulang otomatis saat aplikasi dibuka. Sukses mengirim data belum memastikan kertas keluar. RawBT/USB/Serial mengikuti printer fisik yang dipilih pada perangkat.</p><ErrorNote>{error}</ErrorNote><PrintStatusCard />
    {!jobs.length ? <Empty title="Belum ada antrean cetak" /> : jobs.slice(0, visibleCount).map((job) => <Card key={job.id} title={job.label}><p className="text-sm text-fg-muted">{job.profileName} · {formatDateTime(job.createdAt, tz)} · {LABEL[job.state]} · {job.attempts} percobaan</p>{job.message && <p className="mt-2 text-sm">{job.message}</p>}<div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setPreview(preview === job.id ? null : job.id)}>Pratinjau</Button>{job.state !== 'cancelled' && <Button loading={busy === job.id} disabled={busy !== null} onClick={() => void act(job, job.state === 'handed-off')}>{job.state === 'handed-off' ? 'Cetak salinan baru' : job.state === 'queued' ? 'Kirim ke printer' : 'Periksa & coba lagi'}</Button>}{['queued', 'failed', 'uncertain'].includes(job.state) && <Button variant="outline" disabled={busy !== null} onClick={async () => { if (await confirmDialog({ title: 'Batalkan antrean ini?', message: 'Dokumen tidak akan dikirim. Transaksi tetap tersimpan.', confirmLabel: 'Batalkan antrean' })) { try { await cancelPrintJob(job.id); toast('Antrean dibatalkan'); await load(); } catch (e) { setError(errorMessage(e)); } } }}>Batalkan antrean</Button>}</div>{preview === job.id && <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-2 p-3 text-sm">{toPlainText(job.ops, job.config.width)}</pre>}</Card>)}
    {jobs.length > visibleCount && <Button variant="outline" onClick={() => setVisibleCount((n) => n + 100)}>Tampilkan 100 berikutnya</Button>}
  </div></div>;
}
