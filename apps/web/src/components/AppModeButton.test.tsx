import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppModeButton } from './AppModeButton';
import { isAppleMobile, isAppMode } from '../lib/install';

const install = vi.hoisted(() => ({ prompt: false }));
vi.mock('../lib/install', async (original) => ({
  ...await original<typeof import('../lib/install')>(),
  useInstallPrompt: () => install.prompt ? {} : null,
  useJustInstalled: () => false,
}));

beforeEach(() => {
  install.prompt = false;
  vi.stubGlobal('document', { fullscreenElement: null, fullscreenEnabled: false });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad)', platform: 'iPad', maxTouchPoints: 5 });
});
afterEach(() => vi.unstubAllGlobals());

describe('pemasangan aplikasi iPad / iPhone', () => {
  it('menampilkan instal meskipun prompt dan fullscreen tidak tersedia', () => {
    expect(renderToStaticMarkup(<AppModeButton />)).toContain('Instal aplikasi');
  });
  it('tersedia di header admin', () => {
    expect(renderToStaticMarkup(<AppModeButton light allowFullscreen={false} />)).toContain('Instal aplikasi');
  });
  it('mengenali iPad yang menggunakan identitas desktop Mac', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isAppleMobile()).toBe(true);
    expect(renderToStaticMarkup(<AppModeButton />)).toContain('Instal aplikasi');
  });
  it('mengenali iPhone', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', maxTouchPoints: 5 });
    expect(isAppleMobile()).toBe(true);
  });
  it('Mac biasa tidak mendapat panduan iPad', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isAppleMobile()).toBe(false);
    expect(renderToStaticMarkup(<AppModeButton />)).toBe('');
  });
  it('menyembunyikan tombol saat dibuka lewat ikon iOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPad', platform: 'MacIntel', maxTouchPoints: 5, standalone: true });
    expect(isAppMode()).toBe(true);
    expect(renderToStaticMarkup(<AppModeButton />)).toBe('');
  });
  it('tetap mengenali display-mode standalone', () => {
    vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query === '(display-mode: standalone)' }) });
    expect(renderToStaticMarkup(<AppModeButton />)).toBe('');
  });
  it('mempertahankan tombol instal native Android', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', maxTouchPoints: 5 });
    install.prompt = true;
    expect(isAppleMobile()).toBe(false);
    expect(renderToStaticMarkup(<AppModeButton />)).toContain('Instal aplikasi');
  });
  it('mempertahankan tombol fullscreen browser desktop', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Win32', maxTouchPoints: 0 });
    vi.stubGlobal('document', { fullscreenElement: null, fullscreenEnabled: true });
    expect(renderToStaticMarkup(<AppModeButton />)).toContain('Layar penuh');
    expect(renderToStaticMarkup(<AppModeButton allowFullscreen={false} />)).toBe('');
  });
});
