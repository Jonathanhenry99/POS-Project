/** 25000 -> "25.000"; -7400 -> "-7.400" */
export function formatNumber(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 25000 -> "Rp 25.000"; -7400 -> "-Rp 7.400" */
export function formatRupiah(n: number): string {
  const rounded = Math.round(n);
  return (rounded < 0 ? '-' : '') + 'Rp ' + formatNumber(Math.abs(rounded));
}

/** Mengurai input rupiah bebas ("25.000", "Rp 25000") menjadi angka. */
export function parseRupiah(input: string): number {
  const digits = input.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

function parts(iso: string, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(new Date(iso))) p[type] = value;
  return p as { year: string; month: string; day: string; hour: string; minute: string };
}

/** "06/10/2026 14:05" pada zona waktu toko. */
export function formatDateTime(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

export function formatTime(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** "2026-10-06" pada zona waktu toko (dipakai untuk tanggal bisnis & nomor struk). */
export function businessDate(iso: string, timeZone: string): string {
  const p = parts(iso, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Mengubah teks menjadi ASCII yang aman untuk printer thermal:
 * huruf beraksen dibuang aksennya, tanda kutip/dash khusus diganti, emoji dan karakter lain dihapus.
 */
export function toAscii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[ \t]/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, '');
}
