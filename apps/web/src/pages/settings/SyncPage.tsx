import { CloudOff, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDateTime } from '@mourden/shared';
import { confirmDialog, toast } from '../../components/feedback';
import { Badge, Button, Card, Empty } from '../../components/ui';
import type { OutboxItem } from '../../lib/idb';
import { unpairDevice } from '../../lib/session';
import { useApp } from '../../lib/state';
import { flushOutbox, listOutbox, refreshBootstrap, retryFailed } from '../../lib/sync';

export function SyncPage() {
  const online = useApp((s) => s.online);
  const sync = useApp((s) => s.sync);
  const device = useApp((s) => s.device);
  const user = useApp((s) => s.user);
  const data = useApp((s) => s.data);
  const tz = data?.settings.store.timezone ?? 'Asia/Jakarta';
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void listOutbox().then(setItems);
  }, [sync.pending, sync.failed, sync.syncing]);

  const syncNow = async () => {
    setBusy(true);
    const ok = await refreshBootstrap();
    await flushOutbox();
    setBusy(false);
    toast(ok ? 'Data diperbarui' : 'Server tidak bisa dihubungi', ok ? 'success' : 'error');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">Sinkronisasi</h1>
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            {online ? <Wifi className="size-8 text-emerald-600" /> : <CloudOff className="size-8 text-amber-600" />}
            <div className="flex-1">
              <p className="font-bold">{online ? 'Terhubung ke server' : 'Offline — transaksi tetap tersimpan di tablet'}</p>
              <p className="text-sm text-stone-600">
                {sync.pending} menunggu dikirim · {sync.failed} gagal
                {sync.lastSyncAt && ` · terakhir terkirim ${formatDateTime(sync.lastSyncAt, tz)}`}
              </p>
              {sync.lastError && <p className="text-sm text-red-700">{sync.lastError}</p>}
            </div>
            <Button icon={<RefreshCw className="size-5" />} loading={busy || sync.syncing} onClick={syncNow}>
              Sinkron sekarang
            </Button>
          </div>
        </Card>

        <Card
          title="Antrean"
          action={
            sync.failed > 0 && (
              <Button size="sm" variant="outline" onClick={() => void retryFailed()}>
                Kirim ulang yang gagal
              </Button>
            )
          }
        >
          {!items.length ? (
            <Empty title="Semua data sudah terkirim" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {items.map((i) => (
                <li key={i.seq} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="font-semibold">{i.label}</p>
                    <p className="text-xs text-stone-500">
                      {formatDateTime(i.createdAt, tz)} · {i.attempts}x dicoba
                    </p>
                    {i.lastError && <p className="text-sm text-red-700">{i.lastError}</p>}
                  </div>
                  <Badge tone={i.status === 'failed' ? 'red' : 'amber'}>{i.status === 'failed' ? 'Gagal' : 'Menunggu'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Perangkat ini">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-stone-500">Nama</dt>
            <dd>{device?.name}</dd>
            <dt className="text-stone-500">Kode struk</dt>
            <dd>{device?.code}</dd>
            <dt className="text-stone-500">Data menu</dt>
            <dd>{data ? formatDateTime(data.fetchedAt, tz) : '-'}</dd>
          </dl>
          {user?.role === 'owner' && (
            <Button
              variant="outline"
              className="mt-4 text-red-600"
              icon={<Trash2 className="size-5" />}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'Lepas perangkat kasir?',
                  message:
                    sync.pending + sync.failed > 0
                      ? `Masih ada ${sync.pending + sync.failed} data yang belum terkirim dan akan hilang. Sinkronkan dulu bila memungkinkan.`
                      : 'Tablet ini tidak bisa dipakai berjualan sampai diaktifkan lagi.',
                  confirmLabel: 'Lepas perangkat',
                  danger: true,
                });
                if (!ok) return;
                await unpairDevice();
                navigate('/login', { replace: true });
              }}
            >
              Lepas aktivasi perangkat
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
