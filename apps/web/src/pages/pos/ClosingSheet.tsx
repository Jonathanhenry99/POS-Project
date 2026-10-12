import { Banknote, Camera, CreditCard, Lock, Printer, QrCode, ReceiptText, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatRupiah, type Shift, type ShiftSummary } from '@mourden/shared';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { Reconciliation } from '../../components/Reconciliation';
import { confirmDialog, toast } from '../../components/feedback';
import { Button, ErrorNote, Modal, MoneyInput, TextInput, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { compressPhoto } from '../../lib/photo';
import { attachShiftProof, closeBusinessDay, closeShift, currentShiftSummary } from '../../lib/pos';
import { useApp, useBlindCash } from '../../lib/state';
import { printBusinessDay, printShift, printStatusStore } from '../../printing/service';

/**
 * Tutup kasir dalam satu lembar: (1) hitung uang tunai, (2) ketik angka struk settlement EDC,
 * (3) foto struk settlement & uang tunai. Dipakai untuk akhiri shift maupun tutup toko/hari.
 * Mode buta: catatan sistem dan selisih baru tampil setelah hitungan terkunci.
 */
export function ClosingSheet({ mode, drafts = 0, onClose, onFinished }: { mode: 'shift' | 'day'; drafts?: number; onClose: () => void; onFinished?: (shift: Shift) => void | Promise<void> }) {
  const blind = useBlindCash();
  const required = useApp((s) => s.data?.settings.policy.requireClosingProof ?? false);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [counted, setCounted] = useState<number | null>(null);
  const [qris, setQris] = useState<number | null>(null);
  const [card, setCard] = useState<number | null>(null);
  const [photos, setPhotos] = useState<{ cash: string | null; edc: string | null }>({ cash: null, edc: null });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Shift yang sudah tersimpan: bila tutup hari gagal di tengah, hitungan tidak boleh diulang.
  const [saved, setSaved] = useState<Shift | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    void currentShiftSummary().then(setSummary);
  }, []);

  const missing = [counted === null && 'uang tunai', qris === null && 'settlement QRIS', card === null && 'settlement debit/kredit', !photos.edc && 'foto struk settlement', !photos.cash && 'foto uang tunai'].filter(Boolean) as string[];
  const canSubmit = counted !== null && (!required || !missing.length);

  const submit = async () => {
    if (counted === null) return;
    if (!saved) {
      const skipped = missing.filter((m) => m !== 'uang tunai');
      const lines = [`Uang tunai dihitung: ${formatRupiah(counted)}.`];
      if (!blind && summary && counted !== summary.expectedCash) lines.push(`Selisih kas ${formatRupiah(counted - summary.expectedCash)}.`);
      if (skipped.length) lines.push(`Belum diisi: ${skipped.join(', ')}. Owner akan melihatnya sebagai “tidak diisi”.`);
      lines.push('Setelah ditutup, angka tidak bisa diubah.');
      if (!(await confirmDialog({ title: mode === 'day' ? 'Tutup shift & hari?' : 'Tutup kasir?', message: lines.join(' '), confirmLabel: 'Tutup', danger: skipped.length > 0 }))) return;
    }
    setBusy(true);
    setError('');
    try {
      let shift = saved;
      if (!shift) {
        shift = await closeShift(counted, note, mode, { qris, card });
        for (const kind of ['edc', 'cash'] as const) if (photos[kind]) await attachShiftProof(shift.id, kind, photos[kind]!);
        setSaved(shift);
        printStatusStore.set({ status: { state: 'idle' } });
      }
      if (mode === 'day') void printBusinessDay(await closeBusinessDay(note));
      else void printShift(shift);
      await onFinished?.(shift);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (done && saved) {
    return (
      <Modal open size="lg" onClose={onClose} title={mode === 'day' ? 'Toko ditutup' : 'Kasir ditutup'} footer={<Button size="lg" className="flex-1" onClick={onClose}>Selesai</Button>}>
        <div className="flex flex-col gap-4">
          <p className="text-fg-muted">Hitungan sudah terkunci. Ini hasil pencocokannya dengan catatan sistem. Serahkan uang dan struk rekap ke owner.</p>
          <Reconciliation shift={saved} />
          <PrintStatusCard />
          <Button variant="outline" icon={<Printer className="size-5" />} onClick={() => void printShift(saved)}>
            Cetak rekap shift lagi
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      dismissable={!busy}
      title={mode === 'day' ? 'Tutup toko / hari' : 'Tutup kasir'}
      footer={
        <Button size="lg" className="flex-1" icon={<Lock className="size-5" />} loading={busy} disabled={!canSubmit} onClick={submit}>
          {saved ? 'Lanjutkan tutup hari' : mode === 'day' ? 'Tutup shift terakhir & hari' : 'Tutup kasir & cetak rekap'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Step n={1} icon={<Banknote className="size-5" />} title="Uang tunai di laci" hint={blind ? 'Hitung semua uang tunai, ketik apa adanya.' : summary ? `Catatan sistem: ${formatRupiah(summary.expectedCash)}` : undefined}>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <MoneyInput aria-label="Uang tunai yang dihitung di laci" value={counted ?? 0} onChange={setCounted} disabled={!!saved} autoFocus placeholder="Hitung lalu ketik" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip active={counted === 0} disabled={!!saved} onClick={() => setCounted(0)}>
                  Rp 0
                </Chip>
                {!blind && summary && counted !== null && (
                  <span className={cx('text-sm font-semibold', counted === summary.expectedCash ? 'text-success' : 'text-danger')}>{counted === summary.expectedCash ? 'Pas' : `Selisih ${formatRupiah(counted - summary.expectedCash)}`}</span>
                )}
              </div>
            </div>
            <PhotoSlot label="Foto uang tunai" value={photos.cash} disabled={!!saved} onChange={(v) => setPhotos((p) => ({ ...p, cash: v }))} onError={setError} />
          </div>
        </Step>

        <Step n={2} icon={<ReceiptText className="size-5" />} title="Settlement EDC" hint="Cetak settlement di mesin EDC, lalu ketik totalnya sesuai struk.">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="grid grid-cols-2 gap-3">
              <SettleInput icon={<QrCode className="size-4" />} label="QRIS" value={qris} onChange={setQris} disabled={!!saved} system={!blind && summary ? summary.byMethod.qris : null} />
              <SettleInput icon={<CreditCard className="size-4" />} label="Debit / Kredit" value={card} onChange={setCard} disabled={!!saved} system={!blind && summary ? summary.byMethod.card : null} />
            </div>
            <PhotoSlot label="Foto struk settlement" value={photos.edc} disabled={!!saved} onChange={(v) => setPhotos((p) => ({ ...p, edc: v }))} onError={setError} />
          </div>
        </Step>

        <Step n={3} title="Catatan (opsional)">
          <TextInput aria-label="Catatan tutup kasir" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} disabled={!!saved} placeholder="Mis. uang receh kurang, EDC sempat offline" />
        </Step>

        {required && missing.length > 0 && <p className="rounded-xl bg-warning/10 p-3 text-sm">Wajib diisi sebelum tutup: {missing.join(', ')}.</p>}
        {!!drafts && <p className="rounded-xl bg-warning/10 p-3 text-sm">{drafts} pesanan belum dibayar tetap tersimpan.</p>}
        {saved && error && <p className="text-sm">Shift sudah ditutup. Lanjutkan penutupan hari; jangan hitung shift dua kali.</p>}
        <ErrorNote>{error}</ErrorNote>
        <p className="text-xs text-fg-muted">Tersimpan di tablet lebih dulu. Gangguan internet atau printer tidak membatalkan penutupan; foto ikut terkirim saat online.</p>
      </div>
    </Modal>
  );
}

function Step({ n, icon, title, hint, children }: { n: number; icon?: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line p-3.5">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-bold text-primary">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-bold">
            {icon} {title}
          </p>
          {hint && <p className="text-sm text-fg-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Chip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={cx('press h-9 rounded-xl border px-3 text-sm font-semibold', active ? 'border-primary bg-primary/10 text-primary' : 'border-line text-fg-muted')}>
      {children}
    </button>
  );
}

function SettleInput({ icon, label, value, onChange, disabled, system }: { icon: ReactNode; label: string; value: number | null; onChange: (n: number) => void; disabled?: boolean; system: number | null }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
        {icon} {label}
      </p>
      <MoneyInput aria-label={`Settlement ${label}`} value={value ?? 0} onChange={onChange} disabled={disabled} placeholder="Sesuai struk" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Chip active={value === 0} disabled={disabled} onClick={() => onChange(0)}>
          Tidak ada
        </Chip>
        {system !== null && value !== null && <span className={cx('text-xs font-semibold', value === system ? 'text-success' : 'text-danger')}>{value === system ? 'Pas' : `Sistem ${formatRupiah(system)}`}</span>}
        {value === null && <span className="text-xs text-fg-subtle">belum diisi</span>}
      </div>
    </div>
  );
}

/** Slot foto: membuka kamera belakang di tablet/HP (atau pilih berkas di laptop), lalu menampilkan pratinjau. */
function PhotoSlot({ label, value, onChange, onError, disabled }: { label: string; value: string | null; onChange: (v: string | null) => void; onError: (msg: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressPhoto(file));
      onError('');
    } catch (e) {
      onError(errorMessage(e));
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div className="w-full sm:w-40">
      <input ref={ref} type="file" accept="image/*" capture="environment" className="sr-only" aria-label={label} onChange={(e) => void pick(e.target.files?.[0])} />
      {value ? (
        <div className="relative overflow-hidden rounded-2xl border border-success/50">
          <img src={value} alt={label} className="h-28 w-full object-cover" />
          <div className="flex items-center justify-between gap-1 bg-surface px-2 py-1.5">
            <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className="text-xs font-semibold text-primary">
              Ganti foto
            </button>
            <button type="button" disabled={disabled} aria-label={`Hapus ${label}`} onClick={() => onChange(null)} className="grid size-8 place-items-center rounded-lg text-fg-muted hover:text-danger">
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={disabled || busy} onClick={() => ref.current?.click()} className="press flex h-full min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 px-2 text-center text-sm font-semibold text-fg-muted hover:border-primary/50 hover:text-fg">
          <Camera className="size-6" />
          {busy ? 'Memproses…' : label}
        </button>
      )}
    </div>
  );
}
