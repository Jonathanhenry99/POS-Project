import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { addDaysIso, SCHEDULE_STATUS_LABEL, type ScheduleEntry, type ShiftTemplate } from '@mourden/shared';
import { dayLabel, hours, shiftTone, weekDays, weekLabel, type WeekData } from '../lib/schedule';
import { cx } from './ui';

/** Navigasi minggu: sebelumnya, minggu ini, berikutnya. */
export function WeekNav({ weekStart, thisWeek, onChange, dark = false }: { weekStart: string; thisWeek: string; onChange: (w: string) => void; dark?: boolean }) {
  const btn = cx('press grid size-11 place-items-center rounded-xl', dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-surface shadow-card hover:bg-surface-2');
  return (
    <div className="flex items-center gap-2">
      <button aria-label="Minggu sebelumnya" className={btn} onClick={() => onChange(addDaysIso(weekStart, -7))}>
        <ChevronLeft className="size-5" />
      </button>
      <div className="min-w-0 flex-1 text-center">
        <p className={cx('text-sm font-bold tabular', dark && 'text-white')}>{weekLabel(weekStart)}</p>
        {weekStart !== thisWeek ? (
          <button className={cx('text-xs font-semibold underline-offset-2 hover:underline', dark ? 'text-[var(--lime)]' : 'text-primary')} onClick={() => onChange(thisWeek)}>
            Kembali ke minggu ini
          </button>
        ) : (
          <p className={cx('text-xs', dark ? 'text-white/60' : 'text-fg-muted')}>Minggu ini</p>
        )}
      </div>
      <button aria-label="Minggu berikutnya" className={btn} onClick={() => onChange(addDaysIso(weekStart, 7))}>
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}

/**
 * Jadwal satu minggu, per hari (Senin-Minggu), tiap hari berisi blok shift dan siapa yang masuk.
 * Di layar lebar tujuh hari berdampingan; di HP bertumpuk dengan hari ini di atas. `onCell` membuat sel bisa diatur (owner).
 */
export function WeekSchedule({ data, weekStart, onCell, compact = false, todayFirst = compact }: { data: WeekData; weekStart: string; onCell?: (date: string, template: ShiftTemplate) => void; compact?: boolean; todayFirst?: boolean }) {
  const templates = data.templates.filter((t) => t.active || data.entries.some((e) => e.templateId === t.id));
  const days = weekDays(weekStart);
  // Di HP hari ini diletakkan paling atas supaya langsung terlihat saat aplikasi dibuka.
  const order = todayFirst ? [...days.filter((d) => d >= data.today), ...days.filter((d) => d < data.today)] : days;
  if (!templates.length) return <p className="tile p-5 text-sm text-fg-muted">Belum ada shift. Owner menambahkannya di Jadwal & Gaji → Shift & tarif.</p>;
  return (
    <div className={cx('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-7')}>
      {order.map((date, i) => {
        const isToday = date === data.today;
        const past = date < data.today;
        return (
          <section
            key={date}
            className={cx('animate-rise flex flex-col gap-2 rounded-3xl p-3 shadow-card', isToday ? 'bg-[var(--ink)] text-white' : 'bg-surface', past && !isToday && 'opacity-60')}
            style={{ animationDelay: `${i * 35}ms` }}
          >
            <header className="flex flex-wrap items-center justify-between gap-1 px-1">
              <p className="font-bold capitalize">{dayLabel(date)}</p>
              {isToday && <span className="rounded-full bg-[var(--lime)] px-2 py-0.5 text-[11px] font-bold text-[var(--lime-ink)]">Hari ini</span>}
            </header>
            {templates.map((t, ti) => {
              const people = data.entries.filter((e) => e.date === date && e.templateId === t.id);
              const tone = shiftTone(ti);
              const Wrap = onCell ? 'button' : 'div';
              return (
                <Wrap
                  key={t.id}
                  {...(onCell ? { type: 'button' as const, onClick: () => onCell(date, t), 'aria-label': `Atur ${t.name} ${dayLabel(date)}` } : {})}
                  className={cx('flex w-full flex-col gap-1.5 rounded-2xl p-2.5 text-left', onCell && 'press transition-shadow hover:ring-2 hover:ring-primary/30')}
                  style={{ background: isToday ? 'rgb(255 255 255 / 0.08)' : tone.bg }}
                >
                  <span className="flex flex-wrap items-center justify-between gap-x-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: isToday ? '#fff' : tone.fg }}>
                      <span className="size-2 rounded-full" style={{ background: tone.dot }} />
                      {t.name}
                    </span>
                    <span className={cx('text-[11px] font-semibold whitespace-nowrap tabular', isToday ? 'text-white/70' : 'text-fg-muted')}>{hours(t)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {people.map((e) => (
                      <PersonChip key={e.id} entry={e} template={t} me={e.userId === data.me} dark={isToday} />
                    ))}
                    {!people.length && <span className={cx('text-xs', isToday ? 'text-white/50' : 'text-fg-subtle')}>{onCell ? 'Belum diisi' : '-'}</span>}
                    {onCell && (
                      <span className={cx('grid size-7 place-items-center rounded-full', isToday ? 'bg-white/15' : 'bg-white/70')}>
                        <Plus className="size-3.5" />
                      </span>
                    )}
                  </span>
                </Wrap>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function PersonChip({ entry, template, me, dark }: { entry: ScheduleEntry; template: ShiftTemplate; me: boolean; dark: boolean }) {
  const off = entry.status !== 'masuk';
  return (
    <span
      title={off ? `${SCHEDULE_STATUS_LABEL[entry.status]}${entry.note ? `: ${entry.note}` : ''}` : undefined}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        me ? 'bg-[var(--lime)] text-[var(--lime-ink)] ring-2 ring-[var(--lime-strong)]' : dark ? 'bg-white/15 text-white' : 'bg-white text-fg',
      )}
    >
      <span className={cx(off && 'line-through opacity-60')}>{entry.userName}</span>
      {me && <span>(saya)</span>}
      {(entry.startTime || entry.endTime) && <span className="font-normal opacity-75 tabular">{entry.startTime ?? template.startTime}–{entry.endTime ?? template.endTime}</span>}
      {!!entry.overtimeHours && entry.status === 'masuk' && <span className="rounded-full bg-[var(--violet)] px-1.5 py-px text-[10px] font-bold text-white">+{String(entry.overtimeHours).replace('.', ',')}j lembur</span>}
      {off && <span className="rounded-full bg-danger px-1.5 py-px text-[10px] font-bold text-white">{SCHEDULE_STATUS_LABEL[entry.status]}</span>}
    </span>
  );
}

/** Ringkasan untuk satu orang: shift hari ini & jumlah shift minggu ini. */
export function myShiftToday(data: WeekData): { template: ShiftTemplate; entry: ScheduleEntry }[] {
  return data.entries
    .filter((e) => e.date === data.today && e.userId === data.me)
    .map((e) => ({ entry: e, template: data.templates.find((t) => t.id === e.templateId)! }))
    .filter((x) => x.template);
}

/** Kartu ringkas "shift hari ini" untuk layar awal karyawan: shift saya + siapa saja yang masuk hari ini. */
export function TodayShiftCard({ data, to }: { data: WeekData; to?: string }) {
  const mine = myShiftToday(data);
  const today = data.entries.filter((e) => e.date === data.today && e.status === 'masuk');
  const templates = data.templates.filter((t) => today.some((e) => e.templateId === t.id));
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg-muted">Jadwal hari ini</p>
        {to && <span className="text-xs font-semibold text-primary">Lihat seminggu →</span>}
      </div>
      <p className="mt-1 text-lg font-extrabold tracking-tight">{mine.length ? mine.map(({ template, entry }) => `${template.name} · ${hours({ startTime: entry.startTime ?? template.startTime, endTime: entry.endTime ?? template.endTime })}`).join(', ') : 'Anda libur hari ini'}</p>
      {templates.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {templates.map((t) => {
            const tone = shiftTone(data.templates.indexOf(t));
            return (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: tone.dot }} />
                <span className="w-24 shrink-0 font-semibold">{t.name}</span>
                <span className="text-fg-muted">{today.filter((e) => e.templateId === t.id).map((e) => (e.userId === data.me ? `${e.userName} (saya)` : e.userName)).join(', ')}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
  return to ? (
    <Link to={to} className="tile animate-float-up block p-4 transition-shadow hover:ring-2 hover:ring-primary/20">
      {body}
    </Link>
  ) : (
    <section className="tile animate-float-up p-4">{body}</section>
  );
}
