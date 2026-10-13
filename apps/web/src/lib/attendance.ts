// Absensi di tablet kasir: dicatat lokal dulu lalu masuk antrean sinkron, jadi tetap bisa saat internet putus.
import { DEFAULT_SETTINGS, businessDate, formatTime, lateMinutes, type AttendanceSettings, type CachedUser } from '@mourden/shared';
import { kvGet, kvSet } from './idb';
import { uuid } from './id';
import { appStore } from './state';
import { enqueue } from './sync';

export interface LocalClockIn {
  at: string;
  lateMinutes: number;
}
interface LocalDay {
  date: string;
  entries: Record<string, LocalClockIn>;
}

const KEY = 'attendance';

function context(): { cfg: AttendanceSettings; tz: string } {
  const settings = appStore.get().data?.settings;
  return { cfg: settings?.attendance ?? DEFAULT_SETTINGS.attendance!, tz: settings?.store.timezone ?? 'Asia/Jakarta' };
}

/** Siapa saja yang sudah absen hari ini di tablet ini (userId -> jam & telat). */
export async function todaysAttendance(): Promise<Record<string, LocalClockIn>> {
  const day = await kvGet<LocalDay>(KEY);
  return day && day.date === businessDate(new Date().toISOString(), context().tz) ? day.entries : {};
}

export async function clockIn(user: CachedUser, photo: string): Promise<LocalClockIn> {
  const { cfg, tz } = context();
  if (!cfg.enabled) throw new Error('Absensi belum diaktifkan owner');
  const at = new Date().toISOString();
  const entries = await todaysAttendance();
  if (entries[user.id]) throw new Error(`${user.name} sudah absen hari ini pukul ${formatTime(entries[user.id].at, tz)}`);
  const entry: LocalClockIn = { at, lateMinutes: lateMinutes(at, tz, cfg) };
  await kvSet(KEY, { date: businessDate(at, tz), entries: { ...entries, [user.id]: entry } } satisfies LocalDay);
  // Dikirim atas nama orang yang baru memasukkan PIN-nya; server menolak absen untuk orang lain.
  await enqueue({ method: 'PUT', path: `/tablet/attendance/${uuid()}`, body: { userId: user.id, clockedAt: at, photo }, operatorId: user.id, label: `Absen ${user.name}`, ref: null });
  return entry;
}
