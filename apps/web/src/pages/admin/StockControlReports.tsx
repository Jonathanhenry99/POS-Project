// Pengendalian bahan: Selisih Bahan (hilang tanpa catatan vs toleransi) dan Komplimen Karyawan (siapa mengambil apa).
import { AlertTriangle, CheckCircle2, Gift, PackageSearch } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { STATION_LABEL, VARIANCE_LABEL, formatDateTime, formatNumber, formatRupiah, type VarianceReport as Report, type VarianceRow, type VarianceStatus } from '@mourden/shared';
import { Badge, Card, Empty, ErrorNote, Skeleton, cx } from '../../components/ui';
import { storeTimezone, useApi } from './hooks';
import type { Range } from './reportData';

const qty = (n: number, unit: string) => `${formatNumber(Math.round(n * 100) / 100)} ${unit}`;
const pct = (n: number | null) => (n === null ? '–' : `${String(n).replace('.', ',')}%`);

const STATUS_STYLE: Record<VarianceStatus, string> = {
  abnormal: 'bg-danger/12 text-danger',
  lebih: 'bg-warning/15 text-[#8a5a00]',
  belum_opname: 'bg-surface-3 text-fg-muted',
  wajar: 'bg-success/12 text-success',
};

export function VarianceReport({ range }: { range: Range }) {
  const { data, error } = useApi<Report>(`/reports/stock-variance?from=${range.from}&to=${range.to}`);
  const [filter, setFilter] = useState<VarianceStatus | 'all'>('all');
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Skeleton className="h-96" />;
  const active = data.rows.filter((r) => r.usageQty > 0 || r.wasteQty > 0 || r.opnameCount > 0);
  const rows = active.filter((r) => filter === 'all' || r.status === filter);
  const noUsage = data.rows.every((r) => r.usageQty === 0);
  return (
    <div className="flex flex-col gap-4">
      <p className="tile p-4 text-sm text-fg-muted">
        <b className="text-fg">Cara membaca:</b> setiap bahan yang keluar harus tercatat sebagai <b className="text-fg">terjual</b>, <b className="text-fg">komplimen</b>, atau <b className="text-fg">terbuang</b>. Yang hilang di luar itu
        adalah <b className="text-fg">selisih tak tercatat</b> dari opname. Selisih sampai batas toleransi dianggap wajar (tumpah, takaran); di atasnya abnormal dan perlu ditanyakan.
      </p>
      {noUsage && (
        <Notice>
          <b>Belum ada pemakaian bahan yang tercatat.</b> Penjualan baru memotong stok setelah resep diisi, jadi selisih belum bisa dinilai.{' '}
          <Link to="/admin/resep" className="font-semibold underline">
            Isi Resep & HPP
          </Link>
        </Notice>
      )}
      {data.totals.notCounted > 0 && (
        <Notice>
          <b>{data.totals.notCounted} bahan terpakai tapi belum dihitung</b> (opname) di periode ini, jadi belum bisa dinilai.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Bahan abnormal" value={String(data.totals.abnormal)} tone={data.totals.abnormal ? 'text-danger' : 'text-success'} hint={data.totals.abnormal ? 'melewati batas toleransi' : 'semua dalam batas wajar'} />
        <Tile label="Hilang tak tercatat" value={formatRupiah(data.totals.lossValue)} hint="nilai bahan menurut opname" />
        <Tile label="Di atas batas wajar" value={formatRupiah(data.totals.excessValue)} tone={data.totals.excessValue ? 'text-danger' : undefined} hint="bagian yang abnormal" />
        <Tile label="Terbuang (dicatat)" value={formatRupiah(data.totals.wasteValue)} hint="basi, tumpah, rusak" />
        <Tile label="Komplimen (HPP)" value={formatRupiah(data.totals.compValue)} hint="bahan untuk jatah karyawan" />
      </div>

      <Card
        title="Selisih per bahan"
        icon={<PackageSearch className="size-4" />}
        action={
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {(['all', 'abnormal', 'lebih', 'wajar', 'belum_opname'] as const).map((s) => (
              <button key={s} className="pill h-9 px-3 text-[13px]" aria-pressed={filter === s} onClick={() => setFilter(s)}>
                {s === 'all' ? 'Semua' : VARIANCE_LABEL[s]}
              </button>
            ))}
          </div>
        }
      >
        {!rows.length ? (
          <Empty icon={<CheckCircle2 className="size-8 text-success" />} title={active.length ? 'Tidak ada bahan di kelompok ini' : 'Belum ada pergerakan bahan'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="bg-surface-2 text-left text-fg-muted">
                  <th className="rounded-l-xl px-3 py-2">Bahan</th>
                  <th className="px-3 py-2 text-right">Terjual</th>
                  <th className="px-3 py-2 text-right">Komplimen</th>
                  <th className="px-3 py-2 text-right">Terbuang</th>
                  <th className="px-3 py-2 text-right">Selisih tak tercatat</th>
                  <th className="px-3 py-2 text-right">Batas wajar</th>
                  <th className="px-3 py-2 text-right">Nilai hilang</th>
                  <th className="rounded-r-xl px-3 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <VarianceLine key={r.ingredientId} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-fg-muted">
          Toleransi bawaan {pct(data.defaultTolerancePct)} dari pemakaian (ubah di Pengaturan); toleransi khusus per bahan diatur di Stok Bahan, misalnya 0% untuk cup dan 5% untuk susu. “Lebih” berarti hitungan fisik melebihi
          catatan sistem: biasanya barang masuk belum dicatat atau salah hitung.
        </p>
      </Card>
    </div>
  );
}

function VarianceLine({ r }: { r: VarianceRow }) {
  const missing = r.unexplainedQty > 0;
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2.5">
        <span className="font-semibold">{r.name}</span>
        <span className="block text-xs text-fg-subtle">
          {STATION_LABEL[r.station as keyof typeof STATION_LABEL] ?? r.station} · dihitung {r.opnameCount}x
        </span>
      </td>
      <td className="px-3 py-2.5 text-right tabular">{qty(r.soldQty, r.unit)}</td>
      <td className="px-3 py-2.5 text-right tabular">{r.compQty ? qty(r.compQty, r.unit) : '–'}</td>
      <td className="px-3 py-2.5 text-right tabular">{r.wasteQty ? qty(r.wasteQty, r.unit) : '–'}</td>
      <td className={cx('px-3 py-2.5 text-right font-semibold tabular', r.status === 'abnormal' && 'text-danger')}>
        {r.opnameCount === 0 ? '–' : r.unexplainedQty === 0 ? 'pas' : `${missing ? 'hilang' : 'lebih'} ${qty(Math.abs(r.unexplainedQty), r.unit)}`}
        {r.opnameCount > 0 && r.unexplainedQty !== 0 && <span className="block text-xs font-normal text-fg-subtle">{r.variancePct === null ? 'tanpa pemakaian' : `${pct(Math.abs(r.variancePct))} dari pemakaian`}</span>}
      </td>
      <td className="px-3 py-2.5 text-right tabular">
        {pct(r.tolerance)}
        <span className="block text-xs text-fg-subtle">± {qty(r.allowedQty, r.unit)}</span>
      </td>
      <td className="px-3 py-2.5 text-right tabular">{r.lossValue ? formatNumber(r.lossValue) : '–'}</td>
      <td className="px-3 py-2.5 text-right">
        <span className={cx('inline-flex rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap', STATUS_STYLE[r.status])}>{VARIANCE_LABEL[r.status]}</span>
      </td>
    </tr>
  );
}

interface CompData {
  perDay: number;
  enabled: boolean;
  totals: { orders: number; qty: number; value: number; cost: number };
  byEmployee: { employeeId: string; name: string; orders: number; qty: number; value: number; days: number; overDays: number; items: { name: string; qty: number; value: number }[] }[];
  list: { id: string; number: string; at: string; cashierName: string; employeeName: string; approved: boolean; value: number; qty: number; items: string; overQuota: boolean }[];
}

export function CompReport({ range }: { range: Range }) {
  const { data, error } = useApi<CompData>(`/reports/comps?from=${range.from}&to=${range.to}`);
  const tz = storeTimezone();
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Skeleton className="h-96" />;
  return (
    <div className="flex flex-col gap-4">
      <p className="tile p-4 text-sm text-fg-muted">
        Komplimen dicatat kasir dari layar pembayaran (<b className="text-fg">Komplimen karyawan</b>) dengan menu asli dan PIN penerima. Bahannya terpotong dari stok seperti penjualan, jadi tidak muncul sebagai selisih opname.
        Jatah saat ini <b className="text-fg">{data.perDay} item per orang per hari</b>; lebih dari itu butuh PIN owner dan masuk daftar Perlu Ditinjau.
        {!data.enabled && <b className="text-danger"> Fitur komplimen sedang dinonaktifkan di Pengaturan.</b>}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Item diambil" value={formatNumber(data.totals.qty)} hint={`${data.totals.orders} kali pengambilan`} />
        <Tile label="Nilai jual" value={formatRupiah(data.totals.value)} hint="bila dijual ke pelanggan" />
        <Tile label="Biaya bahan (HPP)" value={formatRupiah(data.totals.cost)} hint="biaya nyata komplimen" />
        <Tile label="Hari melebihi jatah" value={String(data.byEmployee.reduce((n, e) => n + e.overDays, 0))} tone={data.byEmployee.some((e) => e.overDays) ? 'text-danger' : 'text-success'} hint="dijumlah dari semua karyawan" />
      </div>

      {!data.list.length ? (
        <Empty icon={<Gift className="size-8" />} title="Belum ada komplimen di periode ini" />
      ) : (
        <>
          <Card title="Per karyawan" icon={<Gift className="size-4" />}>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.byEmployee.map((e) => (
                <li key={e.employeeId} className="tile-soft p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="sidebar-avatar">{e.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.name}</p>
                      <p className="text-xs text-fg-muted">
                        {e.qty} item · {e.days} hari · {formatRupiah(e.value)}
                      </p>
                    </div>
                    {e.overDays > 0 ? <Badge tone="red">{e.overDays} hari lebih jatah</Badge> : <Badge tone="green">Sesuai jatah</Badge>}
                  </div>
                  <ul className="mt-3 flex flex-col gap-1 text-sm">
                    {e.items.map((i) => (
                      <li key={i.name} className="flex justify-between gap-2">
                        <span className="truncate">{i.name}</span>
                        <span className="text-fg-muted tabular">{i.qty}x</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Riwayat pengambilan">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left text-fg-muted">
                    <th className="rounded-l-xl px-3 py-2">Waktu</th>
                    <th className="px-3 py-2">Penerima</th>
                    <th className="px-3 py-2">Yang diambil</th>
                    <th className="px-3 py-2 text-right">Nilai</th>
                    <th className="px-3 py-2">Dicatat oleh</th>
                    <th className="rounded-r-xl px-3 py-2 text-right">Jatah</th>
                  </tr>
                </thead>
                <tbody>
                  {data.list.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{formatDateTime(c.at, tz)}</td>
                      <td className="px-3 py-2.5 font-semibold">{c.employeeName}</td>
                      <td className="px-3 py-2.5">{c.items}</td>
                      <td className="px-3 py-2.5 text-right tabular">{formatNumber(c.value)}</td>
                      <td className="px-3 py-2.5 text-fg-muted">{c.cashierName}</td>
                      <td className="px-3 py-2.5 text-right">{!c.overQuota ? <Badge tone="green">Sesuai</Badge> : c.approved ? <Badge tone="amber">Lebih · disetujui owner</Badge> : <Badge tone="red">Lebih · tanpa persetujuan</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="tile min-w-0 p-4">
      <p className="truncate text-sm font-medium text-fg-muted">{label}</p>
      <p className={cx('mt-1 truncate text-[24px] leading-tight font-semibold tracking-tight tabular', tone)}>{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-sm">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#8a5a00]" />
      <span>{children}</span>
    </p>
  );
}
