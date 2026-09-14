"use client";

import { Modal } from "@/shared/components/ui/modal";
import { MOCK_ORGANIZER_ANALYTICS } from "@/shared/constants/mock-data";

interface OrganizerDashboardProps {
  open: boolean;
  onClose: () => void;
  eventName: string;
}

export function OrganizerDashboard({ open, onClose, eventName }: OrganizerDashboardProps) {
  const d = MOCK_ORGANIZER_ANALYTICS;

  const stats = [
    { label: "Participants activated", value: d.participantsActivated },
    { label: "Exchanges", value: d.exchanges },
    { label: "Portfolios shared", value: d.portfoliosShared },
    { label: "Unique interactions", value: d.uniqueInteractions },
    { label: "Investors in exchanges", value: d.investors },
    { label: "Founders in exchanges", value: d.founders },
    { label: "Matching interactions", value: d.matchingInteractions },
    { label: "Post-event follow-ups", value: d.postEventFollowUps },
    { label: "Positive outcomes (consented)", value: d.positiveOutcomes },
  ];

  return (
    <Modal open={open} onClose={onClose} title={`Organizer — ${eventName}`}>
      <div className="mb-4 rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-800">
        Агрегированная analytics. Индивидуальные просмотры остаются анонимными.
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800">
            <p className="text-lg font-bold">{s.value.toLocaleString()}</p>
            <p className="text-[10px] text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
