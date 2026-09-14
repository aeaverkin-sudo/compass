"use client";

import { Modal } from "@/shared/components/ui/modal";
import { MOCK_AI_SUMMARY } from "@/shared/constants/mock-data";

interface AiSummaryModalProps {
  open: boolean;
  onClose: () => void;
  personName: string;
}

export function AiSummaryModal({ open, onClose, personName }: AiSummaryModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={`AI Summary — ${personName}`}>
      <div className="mb-4 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
        Demo: система анализирует портфолио, материалы и ссылки и формирует краткое резюме.
      </div>
      <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap text-sm">
        {MOCK_AI_SUMMARY}
      </div>
    </Modal>
  );
}
