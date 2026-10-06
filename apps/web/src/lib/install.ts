// Menangkap tawaran "instal aplikasi" dari Chrome agar bisa dipicu dari tombol di dalam POS.
import { createStore, useStore } from './store';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const installStore = createStore<{ prompt: InstallPromptEvent | null; installed: boolean }>({ prompt: null, installed: false });

/** true bila POS sudah dibuka sebagai aplikasi (tanpa address bar Chrome). */
export function isAppMode(): boolean {
  return ['fullscreen', 'standalone', 'minimal-ui'].some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installStore.set({ prompt: e as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => installStore.set({ prompt: null, installed: true }));
}

export const useInstallPrompt = () => useStore(installStore, (s) => s.prompt);
export const useJustInstalled = () => useStore(installStore, (s) => s.installed);

export async function promptInstall(): Promise<boolean> {
  const p = installStore.get().prompt;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  installStore.set({ prompt: null });
  return outcome === 'accepted';
}
