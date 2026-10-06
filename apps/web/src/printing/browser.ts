// CADANGAN DARURAT: dialog cetak browser (window.print). Bukan alur normal.
import type { PrintOutcome, ReceiptPrinter } from './types';

export class BrowserPrintFallback implements ReceiptPrinter {
  /** Teks struk yang akan dicetak; diisi oleh print service karena jalur ini tidak memakai byte ESC/POS. */
  constructor(private readonly getText: () => string) {}

  async isAvailable() {
    return typeof window !== 'undefined' && typeof window.print === 'function';
  }

  async print(): Promise<PrintOutcome> {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: 58mm auto; margin: 0; }
      body { margin: 0; padding: 2mm; }
      pre { font: 11px/1.25 ui-monospace, Menlo, Consolas, monospace; white-space: pre; margin: 0; }
    </style></head><body><pre></pre></body></html>`);
    doc.close();
    doc.querySelector('pre')!.textContent = this.getText();
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1000);
    return { kind: 'handed-off', message: 'Dialog cetak browser dibuka (mode darurat).' };
  }
}
