import { describe, expect, it } from 'vitest';
import { restoreUrl } from '../src/vercel';

describe('restoreUrl (penerusan Vercel)', () => {
  it('mengembalikan path asli dari __path', () => {
    expect(restoreUrl('/api?__path=sync%2Fbootstrap')).toBe('/api/sync/bootstrap');
    expect(restoreUrl('/api?__path=orders/abc/void')).toBe('/api/orders/abc/void');
  });

  it('mempertahankan query string lain', () => {
    expect(restoreUrl('/api?__path=reports%2Fsummary&from=2026-10-01&to=2026-10-06')).toBe('/api/reports/summary?from=2026-10-01&to=2026-10-06');
    expect(restoreUrl('/api?from=2026-10-01&__path=reports/summary')).toBe('/api/reports/summary?from=2026-10-01');
  });

  it('URL asli tanpa __path dibiarkan', () => {
    expect(restoreUrl('/api/health')).toBe('/api/health');
    expect(restoreUrl('/api/orders?status=void')).toBe('/api/orders?status=void');
  });
});
