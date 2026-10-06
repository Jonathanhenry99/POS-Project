import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Clock3, Eye, Loader2, Printer, RefreshCw, RotateCcw, X } from 'lucide-react';
import { formatDateTime } from '@mourden/shared';
import { ReceiptPreview } from '../../components/ReceiptPreview';
import { Button, Empty, ErrorNote, cx } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';
import { errorMessage } from '../../lib/api';
import { useApp } from '../../lib/state';
import { cancelPrintJob, listPrintJobs, makePrintJob, storePrintJobs, type PrintJob } from '../../printing/queue';
import { printerProfilesStore, sendPrintJob } from '../../printing/service';
import { PrintStatusCard } from '../../components/PrintStatusCard';

/** Status dalam bahasa sehari-hari + warna & ikon. */
const STATUS: Record<PrintJob['state'], { label: string; hint: string; tone: string; icon: typeof Printer }> = {
  queued: { label: 'Belum dikirim', hint: 'Tekan Kirim ke printer', tone: 'bg-primary/10 text-primary', icon: Clock3 },
  sending: { label: 'Sedang dikirim', hint: 'Tunggu sebentar, lalu cek kertas', tone: 'bg-primary/10 text-primary', icon: Loader2 },
  'handed-off': { label: 'Terkirim', hint: 'Sudah dikirim ke printer', tone: 'bg-success/12 text-success', icon: CheckCircle2 },
  failed: { label: 'Gagal', hint: 'Printer tidak menerima. Cek printer lalu coba lagi', tone: 'bg-danger/10 text-danger', icon: AlertTriangle },
  uncertain: { label: 'Perlu dicek', hint: 'Lihat apakah kertas sudah keluar sebelum coba lagi', tone: 'bg-warning/12 text-warning', icon: AlertTriangle },
  cancelled: { label: 'Dibatalkan', hint: 'Tidak akan dikirim', tone: 'bg-surface-3 text-fg-muted', icon: Ban },
};
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
        // Label salinan diletakkan setelah logo (bila ada) agar logo tetap paling atas.
        const ops = job.ops.filter((op) => op.kind !== 'drawer');
        const at = ops[0]?.kind === 'image' ? 1 : 0;
        const next = makePrintJob(`Salinan · ${job.label}`, [...ops.slice(0, at), { kind: 'text', text: '*** SALINAN ***', bold: true, align: 'center' }, ...ops.slice(at)], { ...profile, config: { ...job.config, bridgeToken: profile.config.bridgeToken } });
        await storePrintJobs([next]); id = next.id;
      }
      await sendPrintJob(id, risk);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); await load(); }
  };
  const count = (states: PrintJob['state'][]) => jobs.filter((j) => states.includes(j.state)).length;
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Antrean cetak</h1>
            <p className="text-sm text-fg-muted">Riwayat struk, tagihan, checker dan rekap yang dikirim dari tablet ini.</p>
          </div>
          <Button variant="outline" icon={<RefreshCw className="size-5" />} onClick={() => void load()}>
            Muat ulang
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <QueueStat label="Belum dikirim" value={count(['queued'])} tone="bg-primary/10 text-primary" icon={<Clock3 className="size-5" />} />
          <QueueStat label="Perlu dicek / gagal" value={count(['failed', 'uncertain', 'sending'])} tone="bg-warning/12 text-warning" icon={<AlertTriangle className="size-5" />} />
          <QueueStat label="Terkirim" value={count(['handed-off'])} tone="bg-success/12 text-success" icon={<CheckCircle2 className="size-5" />} />
        </div>
        <p className="rounded-2xl bg-surface-2 p-3 text-sm text-fg-muted">
          “Terkirim” berarti data sudah sampai ke printer/RawBT. Bila kertas tidak keluar, cek printer lalu gunakan <b>Cetak salinan</b>. Antrean tidak dikirim ulang otomatis supaya struk tidak tercetak dobel.
        </p>
        <ErrorNote>{error}</ErrorNote>
        <PrintStatusCard />
        {!jobs.length ? (
          <Empty icon={<Printer className="size-8" />} title="Belum ada antrean cetak">Struk yang dicetak dari kasir akan muncul di sini.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {jobs.slice(0, visibleCount).map((job) => {
              const st = STATUS[job.state];
              const Icon = st.icon;
              return (
                <li key={job.id} className="animate-rise rounded-2xl border border-line bg-surface p-3 shadow-card">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', st.tone)}>
                      <Icon className={cx('size-5', job.state === 'sending' && 'animate-spin')} />
                    </span>
                    <div className="min-w-40 flex-1">
                      <p className="font-bold">{job.label}</p>
                      <p className="text-xs text-fg-muted">
                        {formatDateTime(job.createdAt, tz)} · {job.profileName}
                        {job.attempts > 1 && ` · ${job.attempts}x dicoba`}
                      </p>
                    </div>
                    <span className={cx('rounded-full px-2.5 py-1 text-xs font-bold', st.tone)} title={st.hint}>
                      {st.label}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        aria-label="Pratinjau"
                        onClick={() => setPreview(preview === job.id ? null : job.id)}
                        className={cx('press grid size-11 place-items-center rounded-xl border', preview === job.id ? 'border-primary text-primary' : 'border-line text-fg-muted')}
                      >
                        <Eye className="size-5" />
                      </button>
                      {job.state !== 'cancelled' && (
                        <Button
                          variant={job.state === 'handed-off' ? 'outline' : 'primary'}
                          icon={job.state === 'queued' ? <Printer className="size-4" /> : <RotateCcw className="size-4" />}
                          loading={busy === job.id}
                          disabled={busy !== null}
                          onClick={() => void act(job, job.state === 'handed-off')}
                        >
                          {job.state === 'handed-off' ? 'Cetak salinan' : job.state === 'queued' ? 'Kirim ke printer' : 'Cek & coba lagi'}
                        </Button>
                      )}
                      {['queued', 'failed', 'uncertain'].includes(job.state) && (
                        <button
                          aria-label="Batalkan antrean"
                          disabled={busy !== null}
                          onClick={async () => {
                            if (await confirmDialog({ title: 'Batalkan antrean ini?', message: 'Dokumen tidak akan dikirim. Transaksi tetap tersimpan.', confirmLabel: 'Batalkan antrean' })) {
                              try {
                                await cancelPrintJob(job.id);
                                toast('Antrean dibatalkan');
                                await load();
                              } catch (e) {
                                setError(errorMessage(e));
                              }
                            }
                          }}
                          className="press grid size-11 place-items-center rounded-xl border border-line text-fg-muted hover:text-danger"
                        >
                          <X className="size-5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {(job.state === 'failed' || job.state === 'uncertain') && <p className="mt-2 text-sm text-fg-muted">{job.message || st.hint}</p>}
                  {preview === job.id && <div className="mt-3 overflow-x-auto rounded-xl bg-surface-2 p-3"><ReceiptPreview ops={job.ops} width={job.config.width} /></div>}
                </li>
              );
            })}
          </ul>
        )}
        {jobs.length > visibleCount && (
          <Button variant="outline" onClick={() => setVisibleCount((n) => n + 100)}>
            Tampilkan 100 berikutnya
          </Button>
        )}
      </div>
    </div>
  );
}

function QueueStat({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
      <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', tone)}>{icon}</span>
      <span>
        <span className="block text-2xl leading-none font-extrabold tabular">{value}</span>
        <span className="text-xs text-fg-muted">{label}</span>
      </span>
    </div>
  );
}
