import { Bluetooth, BookOpen, CheckCircle2, FlaskConical, Printer, Usb } from 'lucide-react';
import { useMemo, useState } from 'react';
import { can, testReceipt, toPlainText } from '@mourden/shared';
import { PrintStatusCard } from '../../components/PrintStatusCard';
import { confirmDialog, toast } from '../../components/feedback';
import { Badge, Button, Card, Segmented, TextInput, Toggle, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useApp } from '../../lib/state';
import { isAndroid } from '../../printing/rawbt';
import { createPrinterProfile, DRIVERS, openCashDrawer, printTest, savePrinterConfig, selectPrinterProfile, usePrintStatus, usePrinterConfig, usePrinterProfiles } from '../../printing/service';
import { pickSerialPrinter, webSerialSupported } from '../../printing/webserial';
import { pickUsbPrinter, webUsbSupported } from '../../printing/webusb';

export function PrinterPage() {
  const config = usePrinterConfig();
  const profiles = usePrinterProfiles();
  const user = useApp((s) => s.user);
  const [profileName, setProfileName] = useState('');
  const [drawerBusy, setDrawerBusy] = useState(false);
  const status = usePrintStatus();
  const store = useApp((s) => s.data?.settings.store);
  const [tab, setTab] = useState<'atur' | 'panduan'>('atur');

  const preview = useMemo(
    () => (store ? toPlainText(testReceipt(store, config, DRIVERS.find((d) => d.id === config.driver)!.label, new Date().toISOString()), config.width) : ''),
    [store, config],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Printer struk</h1>
          <div className="w-72">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'atur', label: 'Pengaturan' },
                { value: 'panduan', label: 'Panduan setup' },
              ]}
            />
          </div>
        </div>

        {tab === 'panduan' ? (
          <SetupGuide />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="flex flex-col gap-4">
              <Card title="Profil pengaturan printer">
                <div className="flex flex-col gap-3">
                  <select aria-label="Profil printer aktif" className="h-12 rounded-xl border border-line bg-surface-2 px-3" value={profiles.activeId} onChange={(e) => selectPrinterProfile(e.target.value)}>
                    {profiles.list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <div className="flex gap-2"><TextInput aria-label="Nama profil printer baru" placeholder="Nama profil baru" value={profileName} onChange={(e) => setProfileName(e.target.value.slice(0, 60))} /><Button variant="outline" disabled={!profileName.trim()} onClick={() => {
                    try { createPrinterProfile(profileName); setProfileName(''); toast('Profil disimpan di perangkat ini.'); } catch (e) { toast(errorMessage(e), 'error'); }
                  }}>Simpan profil</Button></div>
                  <p className="text-xs text-fg-muted">Profil menyimpan jalur dan format cetak pada perangkat ini. Ini belum merupakan routing beberapa printer. Pilih printer fisik di RawBT atau ulangi pemilihan USB/Serial saat perangkat berubah.</p>
                </div>
              </Card>
              <Card title="Jalur cetak">
                <div className="flex flex-col gap-2">
                  {DRIVERS.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => savePrinterConfig({ driver: d.id })}
                      className={cx(
                        'flex items-start gap-3 rounded-xl border-2 p-3 text-left',
                        config.driver === d.id ? 'border-primary bg-primary/8' : 'border-line bg-surface',
                      )}
                    >
                      <span className={cx('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2', config.driver === d.id ? 'border-primary bg-primary text-white' : 'border-line-strong')}>
                        {config.driver === d.id && <CheckCircle2 className="size-4" />}
                      </span>
                      <span className="flex-1">
                        <span className="flex flex-wrap items-center gap-2 font-semibold">
                          {d.label}
                          {d.id === 'rawbt' && <Badge tone="green">Rekomendasi</Badge>}
                          {d.experimental && (
                            <Badge tone="amber">
                              <FlaskConical className="size-3" /> Eksperimen
                            </Badge>
                          )}
                          {d.id === 'browser' && <Badge tone="red">Darurat</Badge>}
                        </span>
                        <span className="block text-sm text-fg-muted">{d.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <DriverSetup />
              </Card>

              <Card title="Kertas & perilaku">
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="mb-2 font-semibold">Lebar kertas</p>
                    <Segmented
                      value={String(config.width)}
                      onChange={(v) => savePrinterConfig({ width: Number(v) })}
                      options={[
                        { value: '32', label: '58 mm (32 karakter)' },
                        { value: '48', label: '80 mm (48 karakter)' },
                      ]}
                    />
                  </div>
                  <div>
                    <p className="mb-2 font-semibold">Baris kosong di akhir struk</p>
                    <Segmented
                      value={String(config.feedLines)}
                      onChange={(v) => savePrinterConfig({ feedLines: Number(v) })}
                      options={['2', '3', '4', '5', '6'].map((v) => ({ value: v, label: v }))}
                    />
                  </div>
                  <div>
                    <p className="mb-2 font-semibold">Jumlah salinan struk</p>
                    <Segmented
                      value={String(config.copies)}
                      onChange={(v) => savePrinterConfig({ copies: Number(v) })}
                      options={['1', '2', '3'].map((v) => ({ value: v, label: v }))}
                    />
                  </div>
                  <Toggle checked={config.autoPrint} onChange={(v) => savePrinterConfig({ autoPrint: v })} label="Cetak otomatis setelah bayar" description="Tombol pembayaran menjadi “Bayar & Cetak”." />
                  <Toggle checked={config.cut} onChange={(v) => savePrinterConfig({ cut: v })} label="Potong kertas otomatis" description="Hanya untuk printer yang punya pisau (cutter). EP58M umumnya tidak punya." />
                  <Toggle checked={config.openDrawer} onChange={(v) => savePrinterConfig({ openDrawer: v })} label="Buka laci uang" description="Untuk transaksi tunai, bila laci tersambung ke printer." />
                </div>
              </Card>
            </div>

            <div className="flex flex-col gap-4">
              <Card title="Tes printer">
                <p className="mb-3 text-sm text-fg-muted">Cetak struk contoh untuk memastikan koneksi dan lebar kertas sudah benar.</p>
                <Button size="lg" className="w-full" icon={<Printer className="size-5" />} loading={status.state === 'printing'} onClick={() => void printTest()}>
                  Tes printer
                </Button>
                {user && can(user.role, 'pos.shift') && <>
                  <Button className="mt-3 w-full" variant="outline" loading={drawerBusy} disabled={!config.openDrawer || config.driver === 'browser' || status.state === 'printing'} onClick={async () => {
                    if (!await confirmDialog({ title: 'Buka laci uang?', message: 'Kirim perintah ke printer aktif tanpa mencatat penjualan. Laci harus tersambung dan didukung printer.', confirmLabel: 'Kirim perintah laci' })) return;
                    setDrawerBusy(true);
                    try { await openCashDrawer(); } catch (e) { toast(errorMessage(e), 'error'); } finally { setDrawerBusy(false); }
                  }}>Buka laci tanpa transaksi</Button>
                  <p className="mt-2 text-xs text-fg-muted">Aktifkan pengaturan laci terlebih dahulu. Perintah dicatat pada log; keberhasilan fisik perlu diperiksa pada perangkat.</p>
                </>}
                <div className="mt-3">
                  <PrintStatusCard />
                </div>
              </Card>
              <Card title="Pratinjau struk tes">
                <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-[12px] leading-snug">{preview}</pre>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Tombol memilih perangkat untuk jalur yang butuh izin (Web Serial / WebUSB). */
function DriverSetup() {
  const config = usePrinterConfig();
  const [busy, setBusy] = useState(false);
  const pick = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      toast('Printer dipilih. Tekan "Tes printer".');
    } catch (e) {
      if ((e as Error)?.name !== 'NotFoundError') toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (config.driver === 'rawbt') {
    return !isAndroid() ? (
      <p className="mt-3 rounded-xl bg-warning/10 p-3 text-sm text-warning">RawBT hanya berjalan di Android. Di perangkat ini, tes printer akan gagal.</p>
    ) : (
      <p className="mt-3 text-sm text-fg-muted">Pastikan aplikasi RawBT sudah terpasang dan printer dipilih di RawBT. Lihat tab “Panduan setup”.</p>
    );
  }
  if (config.driver === 'webserial') {
    return (
      <div className="mt-3 flex flex-col gap-2">
        {!webSerialSupported() && <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">Browser ini belum mendukung Web Serial. Perbarui Chrome ke versi 137 atau lebih baru.</p>}
        <Button variant="outline" icon={<Bluetooth className="size-5" />} loading={busy} disabled={!webSerialSupported()} onClick={() => pick(pickSerialPrinter)}>
          Pilih printer Bluetooth
        </Button>
        <p className="text-xs text-fg-muted">Printer harus sudah di-pair di Pengaturan Bluetooth Android.</p>
      </div>
    );
  }
  if (config.driver === 'webusb') {
    return (
      <div className="mt-3 flex flex-col gap-2">
        {!webUsbSupported() && <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">Browser ini tidak mendukung WebUSB.</p>}
        <Button variant="outline" icon={<Usb className="size-5" />} loading={busy} disabled={!webUsbSupported()} onClick={() => pick(pickUsbPrinter)}>
          Pilih printer USB
        </Button>
      </div>
    );
  }
  return <p className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">Mode darurat: setiap cetak akan memunculkan dialog cetak. Kembalikan ke RawBT secepatnya.</p>;
}

const STEPS: { title: string; items: string[] }[] = [
  {
    title: '1. Pair printer ke tablet',
    items: [
      'Nyalakan printer EP58M. Buka Pengaturan Android → Bluetooth.',
      'Pilih printer (biasanya bernama RPP02 / EP58M). Jika diminta PIN, coba 0000 atau 1234.',
    ],
  },
  {
    title: '2. Pasang dan atur RawBT',
    items: [
      'Pasang aplikasi “RawBT ESC/POS thermal printer driver” dari Play Store.',
      'Buka RawBT → pilih jenis koneksi Bluetooth → pilih printer yang sudah di-pair.',
      'Atur lebar kertas 58 mm. Tekan tombol tes di RawBT untuk memastikan printer bekerja.',
      'Saat pertama kali menekan “Bayar & Cetak”, Android bisa menanyakan aplikasi: pilih RawBT → “Selalu”.',
    ],
  },
  {
    title: '3. Pengaturan khusus Xiaomi (HyperOS)',
    items: [
      'Pengaturan → Aplikasi → Kelola aplikasi → RawBT → Penghemat baterai → “Tanpa batasan”.',
      'Lakukan hal yang sama untuk Chrome (aplikasi POS berjalan di Chrome).',
      'Aktifkan “Mulai otomatis” (Autostart) untuk RawBT bila tersedia.',
      'Di daftar aplikasi terbaru, tahan kartu RawBT lalu kunci (ikon gembok) supaya tidak ditutup sistem.',
    ],
  },
  {
    title: '4. Pasang aplikasi POS ke layar utama',
    items: [
      'Buka alamat POS di Chrome → menu ⋮ → “Tambahkan ke Layar utama” / “Instal aplikasi”.',
      'Buka POS dari ikon di layar utama (tampil penuh tanpa bilah alamat).',
      'Kunci rotasi ke landscape di panel cepat Android.',
    ],
  },
];

const CHECKLIST = [
  'Tes cetak dari aplikasi RawBT berhasil',
  'Tombol “Tes printer” di halaman ini langsung mencetak tanpa dialog',
  'Garis angka 1234567890… pas satu baris (lebar 32 karakter)',
  '“Bayar & Cetak” langsung mencetak struk transaksi',
  'Cetak ulang dari Riwayat berfungsi',
  'Printer dimatikan → muncul pesan, transaksi tetap tersimpan di Riwayat',
  'Layar tablet mati lalu dinyalakan → cetak masih berjalan',
  'Internet dimatikan → transaksi & cetak tetap jalan, lalu tersinkron saat online',
];

function SetupGuide() {
  const [done, setDone] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('mourden.printer-checklist') ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = (i: number) => {
    const next = new Set(done);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setDone(next);
    try {
      localStorage.setItem('mourden.printer-checklist', JSON.stringify([...next]));
    } catch {
      /* abaikan */
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        {STEPS.map((s) => (
          <Card key={s.title} title={s.title}>
            <ol className="list-disc space-y-1.5 pl-5 text-fg">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
      <Card
        title={
          <span className="flex items-center gap-2">
            <BookOpen className="size-5" /> Checklist uji di perangkat
          </span>
        }
      >
        <ul className="flex flex-col gap-1">
          {CHECKLIST.map((c, i) => (
            <li key={c}>
              <button onClick={() => toggle(i)} className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-surface-2">
                <span className={cx('mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2', done.has(i) ? 'border-success bg-success text-white' : 'border-line-strong')}>
                  {done.has(i) && <CheckCircle2 className="size-4" />}
                </span>
                <span className={cx(done.has(i) && 'text-fg-subtle line-through')}>{c}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-fg-muted">
          {done.size}/{CHECKLIST.length} selesai. Jangan anggap cetak “sudah jalan” sebelum semua butir dicentang di tablet & printer asli.
        </p>
      </Card>
    </div>
  );
}
