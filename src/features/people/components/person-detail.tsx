"use client";

import { useState } from "react";
import { ArrowLeft, Camera, Sparkles, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useAppStore } from "@/shared/store/app-store";
import { SharedPortfolioView } from "@/features/portfolio/components/shared-portfolio-view";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/input";
import { Modal } from "@/shared/components/ui/modal";
import { VoiceNoteRecorder } from "@/features/ai/components/voice-note-recorder";
import { AiSummaryModal } from "@/features/ai/components/ai-summary-modal";
import { fileToDataUrl, formatDate } from "@/shared/lib/utils";
import type { PortfolioSnapshot } from "@/shared/types";

interface PersonDetailProps {
  personId: string;
}

export function PersonDetail({ personId }: PersonDetailProps) {
  const person = useAppStore((s) => s.people.find((p) => p.id === personId));
  const updatePerson = useAppStore((s) => s.updatePerson);
  const addNote = useAppStore((s) => s.addNote);

  const [note, setNote] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [outcomeModal, setOutcomeModal] = useState(false);

  if (!person) {
    return (
      <div className="p-6 text-center">
        <p>Человек не найден</p>
        <Link href="/people" className="text-indigo-600">← Назад</Link>
      </div>
    );
  }

  const nameParts = person.name.split(" ");
  const snapshot: PortfolioSnapshot = {
    label: person.headline || "Contact",
    displayName: person.name,
    photo: person.photo,
    title: person.headline,
    subtitle: "",
    description: person.description,
    location: person.context.location ?? "",
    items: [],
    name: person.headline,
    firstName: nameParts[0] ?? person.name,
    lastName: nameParts.slice(1).join(" "),
    slots: person.slots,
  };

  const handleSelfie = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    updatePerson(person.id, { selfiePhoto: dataUrl, showSelfie: true });
  };

  const saveNote = () => {
    if (!note.trim()) return;
    addNote(person.id, { type: "text", content: note.trim() });
    setNote("");
  };

  const displayPhoto =
    person.showSelfie && person.selfiePhoto ? person.selfiePhoto : person.photo;

  return (
    <div className="mx-auto max-w-lg px-4 pb-8 pt-4">
      <Link href="/people" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500">
        <ArrowLeft className="h-4 w-4" />
        Назад
      </Link>

      <div className="mb-6 flex items-center gap-4">
        <div className="relative h-20 w-20 overflow-hidden rounded-full bg-gradient-to-br from-indigo-400 to-violet-500">
          {displayPhoto ? (
            <img src={displayPhoto} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-2xl font-bold text-white">
              {person.name.charAt(0)}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{person.name}</h1>
          <p className="text-sm text-zinc-500">{person.headline}</p>
        </div>
      </div>

      {(person.selfiePhoto || person.photo) && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => updatePerson(person.id, { showSelfie: false })}
            className={`rounded-full px-3 py-1 text-xs ${!person.showSelfie ? "bg-indigo-600 text-white" : "bg-zinc-100"}`}
          >
            Profile photo
          </button>
          {person.selfiePhoto && (
            <button
              onClick={() => updatePerson(person.id, { showSelfie: true })}
              className={`rounded-full px-3 py-1 text-xs ${person.showSelfie ? "bg-indigo-600 text-white" : "bg-zinc-100"}`}
            >
              Selfie together
            </button>
          )}
        </div>
      )}

      <label className="mb-4 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-zinc-300 p-3 text-sm dark:border-zinc-700">
        <Camera className="h-4 w-4" />
        Сделать совместное selfie
        <input type="file" accept="image/*" capture="user" className="hidden" onChange={handleSelfie} />
      </label>

      <div className="mb-4 rounded-2xl bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
        <p className="font-medium">Контекст знакомства</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {person.context.eventName && `${person.context.eventName} · `}
          {person.context.location && `${person.context.location} · `}
          {formatDate(person.context.date)}
        </p>
        {person.context.metAt && <p className="mt-1 text-zinc-500">{person.context.metAt}</p>}
      </div>

      <SharedPortfolioView snapshot={snapshot} />

      <div className="mt-4 flex gap-2">
        <Button onClick={() => setAiOpen(true)} variant="secondary" className="flex-1">
          <Sparkles className="h-4 w-4" />
          AI Summary
        </Button>
        <Button onClick={() => setOutcomeModal(true)} variant="secondary" className="flex-1">
          <ThumbsUp className="h-4 w-4" />
          Outcome
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        <h3 className="font-semibold">Заметки</h3>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Интересуется проектом. Отправить pitch. Написать во вторник."
          rows={3}
        />
        <Button onClick={saveNote} size="sm">Сохранить заметку</Button>
        <VoiceNoteRecorder onSave={(content) => addNote(person.id, { type: "voice", content })} />

        {person.notes.length > 0 && (
          <div className="space-y-2">
            {person.notes.map((n) => (
              <div key={n.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <span className="text-[10px] uppercase text-zinc-400">{n.type}</span>
                <p className="mt-1">{n.content}</p>
                <p className="mt-1 text-[10px] text-zinc-400">{formatDate(n.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <AiSummaryModal open={aiOpen} onClose={() => setAiOpen(false)} personName={person.name} />

      <Modal open={outcomeModal} onClose={() => setOutcomeModal(false)} title="Positive outcome">
        <p className="mb-4 text-sm text-zinc-600">
          Встреча оказалась полезной? При взаимном согласии результат может быть учтён организатором конференции (анонимно агрегированно).
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              updatePerson(person.id, { positiveOutcome: "confirmed" });
              setOutcomeModal(false);
            }}
          >
            Да, полезно
          </Button>
          <Button variant="secondary" onClick={() => setOutcomeModal(false)}>
            Позже
          </Button>
        </div>
      </Modal>
    </div>
  );
}
