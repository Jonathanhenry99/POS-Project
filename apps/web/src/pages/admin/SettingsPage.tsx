import { BellRing, Crosshair, Fingerprint, MapPin, Gift, Percent, ReceiptText, Save, ShieldCheck, Store, Tablet, Target, Utensils, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { computeTotals, DEFAULT_SETTINGS, formatDateTime, formatNumber, type AppSettings, type AttendanceSettings, type PricingSettings } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { SearchSelect } from '../../components/SearchSelect';
import { Badge, Button, Card, ErrorNote, Field, MoneyInput, Segmented, Spinner, TextInput, Toggle, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { setBrandLogo } from '../../lib/brand';
import { currentLocation } from '../../lib/my-attendance';
import { refreshBootstrap } from '../../lib/sync';
import { PageHeader } from './AdminRoutes';
import { storeTimezone, useApi } from './hooks';
import { NotifyCard } from './NotifyCard';
import { PillNav } from './PillNav';
import { PosMasterCard } from './PosMasterCard';
import { ReceiptSettingsCard } from './ReceiptSettingsCard';

const TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'WIB (Asia/Jakarta)' },
  { value: 'Asia/Makassar', label: 'WITA (Asia/Makassar)' },
  { value: 'Asia/Jayapura', label: 'WIT (Asia/Jayapura)' },
];

const TWO_COL = 'lg:grid-cols-2';
type Section = 'toko' | 'struk' | 'harga' | 'kasir' | 'operasional' | 'notifikasi' | 'perangkat';
/** `form` = bagian yang disimpan lewat tombol Simpan; bagian lain menyimpan sendiri per tindakan. */
const SECTIONS: { value: Section; label: string; icon: LucideIcon; hint: string; form: boolean; layout: string }[] = [
  { value: 'toko', label: 'Toko', icon: Store, hint: 'Identitas toko di struk dan target penjualan.', form: true, layout: TWO_COL },
  { value: 'struk', label: 'Struk & logo', icon: ReceiptText, hint: 'Logo toko dan isi struk 58 mm.', form: true, layout: 'max-w-5xl' },
  { value: 'harga', label: 'Pajak & service', icon: Percent, hint: 'Service charge, PB1 dan pembulatan total.', form: true, layout: 'max-w-3xl' },
  { value: 'kasir', label: 'Aturan kasir', icon: ShieldCheck, hint: 'Void, diskon, tutup kasir, komplimen, toleransi selisih dan absensi karyawan.', form: true, layout: TWO_COL },
  { value: 'operasional', label: 'Meja & catatan', icon: Utensils, hint: 'Daftar meja, template catatan, alasan pembatalan dan tujuan checker.', form: true, layout: TWO_COL },
  { value: 'notifikasi', label: 'Notifikasi', icon: BellRing, hint: 'Kabar stok ke WhatsApp. Tersimpan otomatis.', form: false, layout: 'max-w-3xl' },
  { value: 'perangkat', label: 'Perangkat & PIN', icon: Tablet, hint: 'Tablet kasir yang aktif dan PIN Anda. Tersimpan otomatis.', form: false, layout: TWO_COL },
];

interface DeviceRow {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export function SettingsPage() {
  const { data, error, loading } = useApi<AppSettings>('/settings');
  const [form, setForm] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Salinan yang terakhir tersimpan, untuk menandai perubahan yang belum disimpan saat berpindah bagian.
  const [stored, setStored] = useState<AppSettings | null>(null);
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.find((x) => x.value === params.get('bagian'))?.value ?? 'toko';
  const current = SECTIONS.find((x) => x.value === section)!;
  useEffect(() => {
    setForm(data);
    setStored(data);
  }, [data]);
  const dirty = !!form && !!stored && JSON.stringify(form) !== JSON.stringify(stored);

  const set = <S extends keyof AppSettings, K extends keyof AppSettings[S]>(section: S, key: K, value: AppSettings[S][K]) =>
    setForm((f) => (f ? { ...f, [section]: { ...f[section], [key]: value } } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setSaveError('');
    try {
      const saved = await api<AppSettings>('/settings', { method: 'PUT', body: form });
      setBrandLogo(saved.brand?.logo ?? '');
      setForm(saved);
      setStored(saved);
      toast('Pengaturan disimpan');
      void refreshBootstrap();
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;
  const attendance = { ...DEFAULT_SETTINGS.attendance!, ...form?.attendance };
  const setAttendance = (patch: Partial<typeof attendance>) => setForm((f) => (f ? { ...f, attendance: { ...attendance, ...patch } } : f));

  return (
    <div className="p-4">
      <PageHeader title="Pengaturan" subtitle={current.hint}>
        {dirty && <span className="self-center rounded-full bg-warning/15 px-3 py-1.5 text-sm font-semibold text-warning">Ada perubahan belum disimpan</span>}
        {(current.form || dirty) && (
          <Button icon={<Save className="size-5" />} loading={busy} disabled={!form || !dirty} onClick={save}>
            Simpan
          </Button>
        )}
      </PageHeader>
      <PillNav label="Bagian pengaturan" className="mb-4" value={section} onChange={(v) => setParams({ bagian: v }, { replace: true })} options={SECTIONS.map(({ value, label, icon: Icon }) => ({ value, label, icon: <Icon className="size-4" /> }))} />
      <ErrorNote>{error || saveError}</ErrorNote>
      {loading && !form && <Spinner className="mx-auto my-10" />}
      {form && (
        <div className={cx('grid grid-cols-1 items-start gap-4 [&>*]:min-w-0', current.layout)}>
          {section === 'toko' && (
            <>
            <Card title="Identitas toko (tampil di struk)">
              <div className="flex flex-col gap-4">
                <Field label="Nama toko">{(id) => <TextInput id={id} value={form.store.name} onChange={(e) => set('store', 'name', e.target.value)} />}</Field>
                <Field label="Alamat">{(id) => <TextInput id={id} value={form.store.address} onChange={(e) => set('store', 'address', e.target.value)} />}</Field>
                <Field label="Telepon / Instagram">{(id) => <TextInput id={id} value={form.store.phone} onChange={(e) => set('store', 'phone', e.target.value)} />}</Field>
                <Field label="Zona waktu">
                  {(id) => (
                    <SearchSelect id={id} label="Zona waktu" value={form.store.timezone} onChange={(v) => set('store', 'timezone', v)} options={TIMEZONES} />
                  )}
                </Field>
              </div>
            </Card>

            <Card title="Target penjualan" icon={<Target className="size-4" />}>
              <Field label="Target penjualan bersih per bulan" hint="Dashboard menampilkan capaian, proyeksi akhir bulan, dan kebutuhan per hari. Kosongkan (0) bila tidak dipakai.">
                {(id) => <MoneyInput id={id} value={form.goals?.monthlySales ?? 0} onChange={(n) => setForm((f) => (f ? { ...f, goals: { monthlySales: n } } : f))} />}
              </Field>
              {(form.goals?.monthlySales ?? 0) > 0 && (
                <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">
                  Setara rata-rata <b className="text-fg">Rp {formatNumber(Math.round((form.goals?.monthlySales ?? 0) / 30))}</b> per hari.
                </p>
              )}
            </Card>
            </>
          )}

          {section === 'struk' && <ReceiptSettingsCard form={form} onChange={setForm} />}

          {section === 'harga' && (
            <Card title="Service charge, pajak (PB1) & pembulatan">
              <div className="flex flex-col gap-4">
                <Toggle checked={form.pricing.serviceEnabled} onChange={(v) => set('pricing', 'serviceEnabled', v)} label="Pakai service charge" description="Dihitung dari subtotal setelah diskon. Matikan bila tidak dipakai." />
                {form.pricing.serviceEnabled && (
                  <Field label="Persen service">{(id) => <TextInput id={id} inputMode="decimal" value={String(form.pricing.servicePct)} onChange={(e) => set('pricing', 'servicePct', num(e.target.value))} />}</Field>
                )}
                <Toggle checked={form.pricing.taxEnabled} onChange={(v) => set('pricing', 'taxEnabled', v)} label="Pakai pajak (PB1)" description="Dihitung dari subtotal setelah diskon + service. Matikan bila tidak dipakai." />
                {form.pricing.taxEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nama pajak">{(id) => <TextInput id={id} value={form.pricing.taxLabel} onChange={(e) => set('pricing', 'taxLabel', e.target.value)} />}</Field>
                    <Field label="Persen pajak">{(id) => <TextInput id={id} inputMode="decimal" value={String(form.pricing.taxPct)} onChange={(e) => set('pricing', 'taxPct', num(e.target.value))} />}</Field>
                  </div>
                )}
                <div>
                  <p className="mb-2 font-semibold">Pembulatan total</p>
                  <Segmented
                    value={form.pricing.roundingMode}
                    onChange={(v) => set('pricing', 'roundingMode', v)}
                    options={[
                      { value: 'none', label: 'Tidak' },
                      { value: 'down', label: 'Ke bawah' },
                      { value: 'nearest', label: 'Terdekat' },
                    ]}
                  />
                  {form.pricing.roundingMode !== 'none' && (
                    <div className="mt-2">
                      <Segmented
                        value={String(form.pricing.roundingUnit)}
                        onChange={(v) => set('pricing', 'roundingUnit', Number(v))}
                        options={['100', '500', '1000'].map((v) => ({ value: v, label: `Rp ${v}` }))}
                      />
                    </div>
                  )}
                </div>
                <PricingExample pricing={form.pricing} />
              </div>
            </Card>
          )}

          {section === 'kasir' && (
            <>
            <Card title="Kebijakan kasir">
              <div className="flex flex-col gap-4">
                <Toggle
                  checked={form.policy.voidRequiresOwnerPin}
                  onChange={(v) => set('policy', 'voidRequiresOwnerPin', v)}
                  label="Void butuh PIN owner"
                  description="Bila mati, kasir bisa membatalkan transaksi dengan alasan (tetap tercatat dan terlihat di laporan)."
                />
                <Toggle
                  checked={form.policy.blindCashClose ?? true}
                  onChange={(v) => set('policy', 'blindCashClose', v)}
                  label="Tutup kasir buta"
                  description="Kasir menghitung uang laci tanpa melihat angka “seharusnya”. Selisih baru tampil setelah kasir ditutup dan tidak bisa diubah."
                />
                <Toggle
                  checked={form.policy.requireClosingProof ?? false}
                  onChange={(v) => set('policy', 'requireClosingProof', v)}
                  label="Wajib bukti saat tutup kasir"
                  description="Kasir harus mengisi angka settlement EDC (QRIS, debit/kredit) serta melampirkan foto struk settlement dan foto uang tunai. Bila mati, tetap bisa diisi tetapi boleh dilewati (tercatat “tidak diisi”)."
                />
                <Field label="Batas diskon kasir tanpa PIN owner (%)" hint="100 = bebas.">
                  {(id) => <TextInput id={id} inputMode="numeric" value={String(form.policy.maxCashierDiscountPct)} onChange={(e) => set('policy', 'maxCashierDiscountPct', Math.min(100, num(e.target.value)))} />}
                </Field>
                <Field
                  label="Jumlah tablet kasir aktif maksimal"
                  hint="Kasir hanya bisa berjualan dari tablet yang diaktifkan owner. Dengan nilai 1, perangkat lain tidak bisa diaktifkan sebelum tablet lama dicabut di bagian Perangkat kasir."
                >
                  {(id) => (
                    <TextInput
                      id={id}
                      inputMode="numeric"
                      value={String(form.policy.maxDevices)}
                      onChange={(e) => set('policy', 'maxDevices', Math.max(1, Math.min(20, num(e.target.value) || 1)))}
                    />
                  )}
                </Field>
              </div>
            </Card>

            <Card title="Komplimen karyawan & toleransi selisih" icon={<Gift className="size-4" />}>
              <div className="flex flex-col gap-4">
                <Toggle
                  checked={form.comp?.enabled ?? true}
                  onChange={(v) => setForm((f) => (f ? { ...f, comp: { ...{ enabled: true, perDay: 1, maxUnitPrice: 0 }, ...f.comp, enabled: v } } : f))}
                  label="Izinkan komplimen karyawan"
                  description="Dicatat kasir dari layar pembayaran dengan menu asli dan PIN penerima. Bahan terpotong dari stok, nilainya Rp 0."
                />
                {(form.comp?.enabled ?? true) && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Jatah per orang per hari (item)" hint="Lebih dari ini butuh PIN owner.">
                      {(id) => <TextInput id={id} inputMode="numeric" value={String(form.comp?.perDay ?? 1)} onChange={(e) => setForm((f) => (f ? { ...f, comp: { ...{ enabled: true, perDay: 1, maxUnitPrice: 0 }, ...f.comp, perDay: Math.max(0, Math.min(50, Math.round(num(e.target.value)))) } } : f))} />}
                    </Field>
                    <Field label="Harga menu tertinggi" hint="0 = semua menu boleh.">
                      {(id) => <MoneyInput id={id} value={form.comp?.maxUnitPrice ?? 0} onChange={(n) => setForm((f) => (f ? { ...f, comp: { ...{ enabled: true, perDay: 1, maxUnitPrice: 0 }, ...f.comp, maxUnitPrice: n } } : f))} />}
                    </Field>
                  </div>
                )}
                <Field label="Toleransi selisih bahan bawaan (%)" hint="Bahan yang hilang tanpa catatan sampai persen ini dari pemakaian dianggap wajar. Toleransi khusus per bahan diatur di Stok Bahan.">
                  {(id) => <TextInput id={id} inputMode="decimal" value={String(form.stock?.tolerancePct ?? 3)} onChange={(e) => setForm((f) => (f ? { ...f, stock: { tolerancePct: Math.max(0, Math.min(100, num(e.target.value))) } } : f))} />}
                </Field>
              </div>
            </Card>
            </>
          )}

          {section === 'kasir' && (
            <Card title="Absensi karyawan" icon={<Fingerprint className="size-4" />}>
              <div className="flex flex-col gap-4">
                <Toggle
                  checked={attendance.enabled}
                  onChange={(v) => setAttendance({ enabled: v })}
                  label="Aktifkan absen masuk"
                  description="Tombol Absen masuk muncul di layar login tablet kasir. Karyawan memasukkan PIN sendiri lalu selfie; hasilnya terlihat di menu Absensi."
                />
                {attendance.enabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Jam masuk" hint="Absen setelah jam ini dihitung telat.">
                      {(id) => <TextInput id={id} type="time" value={attendance.startTime} onChange={(e) => e.target.value && setAttendance({ startTime: e.target.value })} />}
                    </Field>
                    <Field label="Toleransi (menit)" hint="0 = tidak ada toleransi.">
                      {(id) => <TextInput id={id} inputMode="numeric" value={String(attendance.graceMinutes)} onChange={(e) => setAttendance({ graceMinutes: Math.max(0, Math.min(180, Math.round(num(e.target.value)))) })} />}
                    </Field>
                  </div>
                )}
                {attendance.enabled && <StoreLocation value={attendance} onChange={setAttendance} />}
                <p className="text-xs text-fg-muted">Akun barista/kitchen yang login di HP wajib absen dulu sebelum membuka Stok. Kabar telat dan ringkasan siapa yang belum absen dikirim lewat Notifikasi WhatsApp bila sudah diatur.</p>
              </div>
            </Card>
          )}

          {section === 'operasional' && <PosMasterCard value={form.pos} onChange={(pos) => setForm((f) => (f ? { ...f, pos } : f))} />}
          {section === 'notifikasi' && <NotifyCard />}
          {section === 'perangkat' && (
            <>
              <Devices />
              <ChangePin />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Contoh hitungan untuk pesanan Rp 100.000, supaya efek service/PB1 langsung terlihat. */
function PricingExample({ pricing }: { pricing: PricingSettings }) {
  const t = computeTotals([{ lineTotal: 100_000 }], null, pricing);
  const rows: [string, number][] = [['Pesanan', t.subtotal]];
  if (t.serviceAmount) rows.push([`Service ${pricing.servicePct}%`, t.serviceAmount]);
  if (t.taxAmount) rows.push([`${pricing.taxLabel} ${pricing.taxPct}%`, t.taxAmount]);
  if (t.roundingAmount) rows.push(['Pembulatan', t.roundingAmount]);
  return (
    <div className="rounded-2xl bg-surface-2 p-3 text-sm">
      <p className="mb-1.5 font-semibold text-fg-muted">Contoh hitungan</p>
      {rows.map(([label, value]) => (
        <p key={label} className="flex justify-between tabular">
          <span>{label}</span>
          <span>{formatNumber(value)}</span>
        </p>
      ))}
      <p className="mt-1 flex justify-between border-t border-line pt-1 font-bold tabular">
        <span>Dibayar pelanggan</span>
        <span>Rp {formatNumber(t.total)}</span>
      </p>
      {!t.serviceAmount && !t.taxAmount && <p className="mt-1 text-xs text-fg-muted">Tanpa service & pajak: pelanggan membayar sesuai harga menu, dan baris service/pajak tidak muncul di struk.</p>}
    </div>
  );
}

function Devices() {
  const { data, error, reload } = useApi<DeviceRow[]>('/devices');
  const tz = storeTimezone();
  return (
    <Card title="Perangkat kasir">
      <ErrorNote>{error}</ErrorNote>
      <ul className="divide-y divide-line">
        {data?.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-2">
            <Tablet className="size-5 text-fg-muted" />
            <div className="flex-1">
              <p className={cx('font-semibold', d.revokedAt && 'text-fg-subtle line-through')}>
                {d.name} <Badge>Kode {d.code}</Badge>
              </p>
              <p className="text-xs text-fg-muted">{d.lastSeenAt ? `Terakhir aktif ${formatDateTime(d.lastSeenAt, tz)}` : 'Belum pernah sinkron'}</p>
            </div>
            {!d.revokedAt && (
              <Button
                size="sm"
                variant="outline"
                className="text-danger"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: `Cabut ${d.name}?`,
                    message: 'Perangkat ini tidak bisa lagi mengirim transaksi ke server. Lakukan bila tablet hilang atau diganti.',
                    confirmLabel: 'Cabut akses',
                    danger: true,
                  });
                  if (!ok) return;
                  try {
                    await api(`/devices/${d.id}/revoke`, { method: 'POST' });
                    reload();
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                  }
                }}
              >
                Cabut
              </Button>
            )}
            {d.revokedAt && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger!"
                onClick={async () => {
                  const ok = await confirmDialog({ title: `Hapus ${d.name} (kode ${d.code}) dari daftar?`, message: 'Perangkat ini sudah dicabut. Transaksinya tetap tersimpan dan kode struknya tidak dipakai lagi oleh tablet lain.', confirmLabel: 'Hapus dari daftar', danger: true });
                  if (!ok) return;
                  try {
                    await api(`/devices/${d.id}`, { method: 'DELETE' });
                    reload();
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                  }
                }}
              >
                Hapus
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-fg-muted">Untuk menambah tablet: buka aplikasi di tablet baru → “Jadikan perangkat ini tablet kasir”.</p>
    </Card>
  );
}

function ChangePin() {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^\d{4,6}$/.test(oldPin) && /^\d{4,6}$/.test(newPin);
  return (
    <Card title="Ganti PIN saya">
      <div className="grid grid-cols-2 gap-3">
        <Field label="PIN lama">{(id) => <TextInput id={id} type="password" inputMode="numeric" maxLength={6} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))} />}</Field>
        <Field label="PIN baru">{(id) => <TextInput id={id} type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} />}</Field>
      </div>
      <Button
        className="mt-3"
        variant="outline"
        loading={busy}
        disabled={!valid}
        onClick={async () => {
          setBusy(true);
          try {
            await api('/me/pin', { method: 'POST', body: { oldPin, newPin } });
            toast('PIN diganti');
            setOldPin('');
            setNewPin('');
            void refreshBootstrap();
          } catch (e) {
            toast(errorMessage(e), 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        Ganti PIN
      </Button>
    </Card>
  );
}

/**
 * Titik toko untuk absen dari HP: owner menandainya sekali saat berada di toko. Tanpa titik ini, absen dari HP
 * tetap tercatat (selfie + jam server) tetapi lokasinya tidak diperiksa.
 */
function StoreLocation({ value, onChange }: { value: AttendanceSettings; onChange: (patch: Partial<AttendanceSettings>) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = value.storeLat !== null && value.storeLng !== null;
  const mark = async () => {
    setBusy(true);
    setError('');
    const r = await currentLocation();
    setBusy(false);
    if (r.kind !== 'ok') return setError(r.kind === 'denied' ? 'Izin lokasi ditolak browser. Izinkan lokasi untuk situs ini lalu coba lagi.' : 'Lokasi tidak didapat. Nyalakan GPS lalu coba lagi.');
    if (r.at.accuracy > 100) setError(`Ketelitian lokasi masih ± ${Math.round(r.at.accuracy)} m. Titik tetap disimpan; coba lagi di dekat jendela agar lebih tepat.`);
    onChange({ storeLat: Math.round(r.at.lat * 1e6) / 1e6, storeLng: Math.round(r.at.lng * 1e6) / 1e6 });
  };
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <MapPin className="size-4 text-primary" /> Lokasi toko untuk absen dari HP
      </p>
      {set ? (
        <p className="mt-1 text-sm text-fg-muted">
          Tersimpan ({value.storeLat!.toFixed(5)}, {value.storeLng!.toFixed(5)}).{' '}
          <a href={`https://www.google.com/maps?q=${value.storeLat},${value.storeLng}`} target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">
            Lihat di peta
          </a>
          . Absen dari HP hanya diterima dalam radius di bawah.
        </p>
      ) : (
        <p className="mt-1 text-sm text-fg-muted">Belum diatur: lokasi tidak diperiksa. Tandai saat Anda berada di dalam toko.</p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Button variant="outline" icon={<Crosshair className="size-5" />} loading={busy} onClick={() => void mark()}>
          {set ? 'Perbarui dari lokasi saya' : 'Tandai lokasi toko dari sini'}
        </Button>
        {set && (
          <Button variant="ghost" className="text-danger!" onClick={() => onChange({ storeLat: null, storeLng: null })}>
            Hapus titik
          </Button>
        )}
        {set && (
          <div className="w-36">
            <Field label="Radius (meter)">
              {(id) => <TextInput id={id} inputMode="numeric" value={String(value.radiusM)} onChange={(e) => onChange({ radiusM: Math.max(30, Math.min(2000, Number(e.target.value.replace(/\D/g, '')) || 30)) })} />}
            </Field>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-warning">{error}</p>}
      <p className="mt-2 text-xs text-fg-subtle">Jangan lupa tekan Simpan. GPS di dalam ruangan bisa meleset puluhan meter; radius 100–200 m biasanya pas.</p>
    </div>
  );
}
