import { AlertTriangle } from 'lucide-react';
import { Component, type ReactNode } from 'react';

/** Bila ada error tak terduga, tampilkan layar pemulihan alih-alih layar putih. Transaksi aman di tablet. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md rounded-3xl bg-surface p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto size-12 text-warning" />
          <p className="mt-3 text-xl font-bold">Terjadi kesalahan pada aplikasi</p>
          <p className="mt-1 text-fg-muted">Transaksi yang sudah dibayar tetap tersimpan di tablet. Muat ulang untuk melanjutkan.</p>
          <p className="mt-3 rounded-lg bg-surface-2 p-2 font-mono text-xs text-fg-muted">{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} className="mt-4 h-14 w-full rounded-xl bg-primary text-lg font-semibold text-white">
            Muat ulang
          </button>
        </div>
      </div>
    );
  }
}
