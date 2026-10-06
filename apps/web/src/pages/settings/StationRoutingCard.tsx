import { useEffect, useState } from 'react';
import type { Station } from '@mourden/shared';
import { Card, ErrorNote, inputClass } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { usePrinterProfiles } from '../../printing/service';
import { loadStationRoutes, saveStationRoutes, STATION_LABEL, type StationRoutes } from '../../printing/routing';

export function StationRoutingCard() {
  const profiles = usePrinterProfiles(); const [routes, setRoutes] = useState<StationRoutes>({}); const [error, setError] = useState(''); const [ready, setReady] = useState(false);
  useEffect(() => { void loadStationRoutes().then((v) => { setRoutes(v); setReady(true); }).catch((e) => setError(errorMessage(e))); }, []);
  const save = async (next: StationRoutes) => { try { await saveStationRoutes(next); setRoutes(next); setError(''); } catch (e) { setError(errorMessage(e)); } };
  return <Card title="Routing checker dapur / bar"><div className="flex flex-col gap-3"><p className="text-sm text-fg-muted">Tujuan produk mengikuti master toko; profil printer dan mode tiket disimpan lokal pada tablet. Arti mode di Mourden: satu tiket per station/pesanan, per baris menu, atau per unit jumlah menu.</p>
    {(['umum', 'bar', 'kitchen'] as Station[]).map((station) => <div key={station} className="rounded-xl border border-line p-3"><p className="mb-2 font-semibold">{STATION_LABEL[station]}</p><select aria-label={`Profil station ${STATION_LABEL[station]}`} disabled={!ready} className={inputClass} value={routes[station]?.profileId ?? ''} onChange={(e) => { const next = { ...routes }; if (e.target.value) next[station] = { profileId: e.target.value, mode: routes[station]?.mode ?? 'order' }; else delete next[station]; void save(next); }}><option value="">Belum dihubungkan</option>{profiles.list.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.config.driver}</option>)}</select>{routes[station] && <select aria-label={`Mode station ${STATION_LABEL[station]}`} className={`${inputClass} mt-2`} value={routes[station]!.mode} onChange={(e) => void save({ ...routes, [station]: { ...routes[station]!, mode: e.target.value as 'order' | 'item' | 'quantity' } })}><option value="order">Per pesanan</option><option value="item">Per baris menu</option><option value="quantity">Per jumlah menu</option></select>}</div>)}
    <ErrorNote>{error}</ErrorNote>
  </div></Card>;
}
