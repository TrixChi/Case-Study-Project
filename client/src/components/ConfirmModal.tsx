import Modal from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  processingLabel?: string;
  confirmClassName?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isProcessing = false,
  processingLabel = 'Deleting…',
  confirmClassName = 'btn-danger',
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-5">
        <p className="text-sm text-surface-600 leading-6 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary">{cancelLabel}</button>
          <button onClick={onConfirm} disabled={isProcessing} className={confirmClassName}>
            {isProcessing ? processingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}