import { previewPrintStore, usePreviewPrint } from '../printing/service';
import { ReceiptPreview } from './ReceiptPreview';
import { Button, Modal } from './ui';

/** Mode pratinjau kasir: dokumen yang "dicetak" muncul di sini, bukan di printer. */
export function PreviewPrintModal() {
  const doc = usePreviewPrint();
  if (!doc) return null;
  const close = () => previewPrintStore.set({ doc: null });
  return (
    <Modal open title={`${doc.label} · pratinjau`} onClose={close} footer={<Button onClick={close}>Tutup</Button>}>
      <p className="mb-3 text-sm text-fg-muted">Mode pratinjau: dokumen ini tidak dikirim ke printer.</p>
      <div className="overflow-x-auto rounded-2xl bg-surface-2 p-4">
        <ReceiptPreview ops={doc.ops} width={doc.width} />
      </div>
    </Modal>
  );
}
