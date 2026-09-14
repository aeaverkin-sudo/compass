"use client";

import { useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { MOCK_VOICE_TRANSCRIPTION } from "@/shared/constants/mock-data";

interface VoiceNoteRecorderProps {
  onSave: (content: string) => void;
}

export function VoiceNoteRecorder({ onSave }: VoiceNoteRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const start = () => setRecording(true);

  const stop = () => {
    setRecording(false);
    setTranscribing(true);
    setTimeout(() => {
      setTranscribing(false);
      onSave(MOCK_VOICE_TRANSCRIPTION);
    }, 1500);
  };

  return (
    <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900">
      <p className="mb-3 text-sm font-medium">Голосовая заметка</p>

      {recording && (
        <div className="mb-3 flex h-8 items-end gap-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1 animate-pulse rounded-full bg-indigo-500"
              style={{ height: `${8 + Math.random() * 24}px`, animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      )}

      {transcribing ? (
        <p className="text-sm text-indigo-600">Transcribing...</p>
      ) : (
        <Button
          variant={recording ? "danger" : "secondary"}
          size="sm"
          onClick={recording ? stop : start}
        >
          {recording ? (
            <>
              <Square className="h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              Record
            </>
          )}
        </Button>
      )}
    </div>
  );
}
