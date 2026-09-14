"use client";

import { Modal } from "@/shared/components/ui/modal";
import { MOCK_BATCH_SUMMARY } from "@/shared/constants/mock-data";

interface BatchSummaryModalProps {
  open: boolean;
  onClose: () => void;
  eventName: string;
}

export function BatchSummaryModal({ open, onClose, eventName }: BatchSummaryModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={`Batch Summary — ${eventName}`}>
      <div className="mb-4 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700 dark:bg-indigo-950">
        Demo: выбрано 23 человека с мероприятия. Реальный batch AI summary подключим позже.
      </div>
      <div className="whitespace-pre-wrap text-sm">{MOCK_BATCH_SUMMARY}</div>
    </Modal>
  );
}
