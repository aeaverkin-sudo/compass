"use client";

import { useState } from "react";
import Link from "next/link";
import { QrCode } from "lucide-react";
import { useAppStore } from "@/shared/store/app-store";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { daysUntil, formatDate } from "@/shared/lib/utils";

export function EventsScreen() {
  const events = useAppStore((s) => s.events);
  const joinEvent = useAppStore((s) => s.joinEvent);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const handleJoin = () => {
    const event = joinEvent(code);
    if (!event) {
      setError("Код не найден. Попробуйте WS2026 или SLUSH26");
      return;
    }
    setError("");
    setCode("");
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-8">
      <h1 className="mb-1 text-2xl font-bold">Events</h1>
      <p className="mb-6 text-sm text-zinc-500">Event Space — отдельное пространство для каждой конференции</p>

      <div className="mb-6 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        <div className="mb-3 flex items-center gap-2">
          <QrCode className="h-5 w-5 text-indigo-600" />
          <span className="font-medium">Подключиться к мероприятию</span>
        </div>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Код: WS2026 или SLUSH26"
          className="mb-2"
        />
        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
        <Button onClick={handleJoin} className="w-full">Подключиться</Button>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          Подключитесь к конференции по коду или QR
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const days = daysUntil(event.activeUntil);
            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="block rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
              >
                <p className="font-semibold">{event.name}</p>
                <p className="text-sm text-zinc-500">{event.location}</p>
                <p className="mt-2 text-xs text-zinc-400">
                  {formatDate(event.startDate)} — {formatDate(event.endDate)}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    Active {days} days left
                  </span>
                  <span className="text-xs text-zinc-400">Event Space →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
