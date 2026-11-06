import { ArrowLeft, CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { BrandLogo } from '../../components/BrandLogo';
import { WeekNav, WeekSchedule, myShiftToday } from '../../components/WeekSchedule';
import { ErrorNote, Skeleton } from '../../components/ui';
import { currentWeekStart, hours, useWeek } from '../../lib/schedule';
import { useApp } from '../../lib/state';

/** Jadwal shift untuk karyawan di HP: hari ini di atas, lalu sisa minggu. */
export function MySchedulePage() {
  const user = useApp((s) => s.user)!;
  const [week, setWeek] = useState(() => currentWeekStart());
  const thisWeek = currentWeekStart();
  const { data, error, loading } = useWeek(week);
  const mine = data ? myShiftToday(data) : [];
  const myWeek = data ? data.entries.filter((e) => e.userId === data.me && e.status === 'masuk').length : 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-4">
        <Link to="/" aria-label="Kembali" className="press grid size-11 place-items-center rounded-xl bg-surface shadow-card">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[17px] font-extrabold tracking-tight">Jadwal shift</p>
          <p className="truncate text-xs text-fg-muted">{user.name}</p>
        </div>
        <BrandLogo className="h-11 w-12 rounded-xl" />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-4 pb-10">
        {data && week === thisWeek && (
          <section className="bg-grad-header animate-rise relative overflow-hidden rounded-[28px] p-5 text-white">
            <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0" />
            <div className="relative">
              <p className="flex items-center gap-2 text-sm text-white/70">
                <CalendarDays className="size-4" /> Shift saya hari ini
              </p>
              {mine.length ? (
                mine.map(({ entry, template }) => (
                  <div key={entry.id} className="mt-2">
                    <p className="text-3xl font-extrabold tracking-tight">{template.name}</p>
                    <p className="text-lg font-semibold text-[var(--lime)] tabular">{hours(template)}</p>
                    {entry.status !== 'masuk' && <p className="mt-1 text-sm text-[#ffc861]">Tercatat {entry.status}</p>}
                  </div>
                ))
              ) : (
                <p className="mt-2 text-2xl font-extrabold tracking-tight">Libur hari ini</p>
              )}
              <p className="mt-3 text-sm text-white/70">{myWeek} shift minggu ini</p>
            </div>
          </section>
        )}
        <WeekNav weekStart={week} thisWeek={thisWeek} onChange={setWeek} />
        <ErrorNote>{error}</ErrorNote>
        {loading && !data && <Skeleton className="h-96 rounded-3xl" />}
        {data && <WeekSchedule data={data} weekStart={week} compact />}
      </main>
    </div>
  );
}
