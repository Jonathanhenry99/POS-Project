import { Save, Tablet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDateTime, type AppSettings } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { Badge, Button, Card, ErrorNote, Field, Segmented, Spinner, TextInput, Toggle, cx, inputClass } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { refreshBootstrap } from '../../lib/sync';
import { PageHeader } from './AdminRoutes';
import { storeTimezone, useApi } from './hooks';

const TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'WIB (Asia/Jakarta)' },
  { value: 'Asia/Makassar', label: 'WITA (Asia/Makassar)' },
  { value: 'Asia/Jayapura', label: 'WIT (Asia/Jayapura)' },
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
  useEffect(() => setForm(data), [data]);

  const set = <S extends keyof AppSettings, K extends keyof AppSettings[S]>(section: S, key: K, value: AppSettings[S][K]) =>
    setForm((f) => (f ? { ...f, [section]: { ...f[section], [key]: value } } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setSaveError('');
    try {
      await api('/settings', { method: 'PUT', body: form });
      toast('Pengaturan disimpan');
      void refreshBootstrap();
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;

  return (
    <div className="p-4">
      <PageHeader title="Pengaturan">
        <Button icon={<Save className="size-5" />} loading={busy} disabled={!form} onClick={save}>
          Simpan
        </Button>
      </PageHeader>
      <ErrorNote>{error || saveError}</ErrorNote>
      {loading && !form && <Spinner className="mx-auto my-10" />}
      {form && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Identitas toko (tampil di struk)">
            <div className="flex flex-col gap-4">
              <Field label="Nama toko">{(id) => <TextInput id={id} value={form.store.name} onChange={(e) => set('store', 'name', e.target.value)} />}</Field>
              <Field label="Alamat">{(id) => <TextInput id={id} value={form.store.address} onChange={(e) => set('store', 'address', e.target.value)} />}</Field>
              <Field label="Telepon / Instagram">{(id) => <TextInput id={id} value={form.store.phone} onChange={(e) => set('store', 'phone', e.target.value)} />}</Field>
              <Field label="Teks penutup struk">{(id) => <TextInput id={id} value={form.store.footer} onChange={(e) => set('store', 'footer', e.target.value)} />}</Field>
              <Field label="Zona waktu">
                {(id) => (
                  <select id={id} value={form.store.timezone} onChange={(e) => set('store', 'timezone', e.target.value)} className={inputClass}>
                    {TIMEZONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </Card>

          <Card title="Service, pajak & pembulatan">
            <div className="flex flex-col gap-4">
              <Toggle checked={form.pricing.serviceEnabled} onChange={(v) => set('pricing', 'serviceEnabled', v)} label="Service charge" description="Dihitung dari subtotal setelah diskon." />
              {form.pricing.serviceEnabled && (
                <Field label="Persen service">{(id) => <TextInput id={id} inputMode="decimal" value={String(form.pricing.servicePct)} onChange={(e) => set('pricing', 'servicePct', num(e.target.value))} />}</Field>
              )}
              <Toggle checked={form.pricing.taxEnabled} onChange={(v) => set('pricing', 'taxEnabled', v)} label="Pajak (PB1)" description="Dihitung dari (subtotal setelah diskon + service)." />
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
            </div>
          </Card>

          <Card title="Kebijakan kasir">
            <div className="flex flex-col gap-4">
              <Toggle
                checked={form.policy.voidRequiresOwnerPin}
                onChange={(v) => set('policy', 'voidRequiresOwnerPin', v)}
                label="Void butuh PIN owner"
                description="Bila mati, kasir bisa membatalkan transaksi dengan alasan (tetap tercatat dan terlihat di laporan)."
              />
              <Field label="Batas diskon kasir tanpa PIN owner (%)" hint="100 = bebas.">
                {(id) => <TextInput id={id} inputMode="numeric" value={String(form.policy.maxCashierDiscountPct)} onChange={(e) => set('policy', 'maxCashierDiscountPct', Math.min(100, num(e.target.value)))} />}
              </Field>
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <Devices />
            <ChangePin />
          </div>
        </div>
      )}
    </div>
  );
}

function Devices() {
  const { data, error, reload } = useApi<DeviceRow[]>('/devices');
  const tz = storeTimezone();
  return (
    <Card title="Perangkat kasir">
      <ErrorNote>{error}</ErrorNote>
      <ul className="divide-y divide-stone-100">
        {data?.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-2">
            <Tablet className="size-5 text-stone-500" />
            <div className="flex-1">
              <p className={cx('font-semibold', d.revokedAt && 'text-stone-400 line-through')}>
                {d.name} <Badge>Kode {d.code}</Badge>
              </p>
              <p className="text-xs text-stone-500">{d.lastSeenAt ? `Terakhir aktif ${formatDateTime(d.lastSeenAt, tz)}` : 'Belum pernah sinkron'}</p>
            </div>
            {!d.revokedAt && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600"
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
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-stone-500">Untuk menambah tablet: buka aplikasi di tablet baru → “Jadikan perangkat ini tablet kasir”.</p>
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
