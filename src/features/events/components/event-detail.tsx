"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Search, Users } from "lucide-react";
import { useAppStore } from "@/shared/store/app-store";
import { PersonCard } from "@/features/people/components/person-card";
import { MatchingResults } from "@/features/matching/components/matching-results";
import { BatchSummaryModal } from "@/features/ai/components/batch-summary-modal";
import { OrganizerDashboard } from "@/features/analytics/components/organizer-dashboard";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/input";
import { daysUntil } from "@/shared/lib/utils";

interface EventDetailProps {
  eventId: string;
}

export function EventDetail({ eventId }: EventDetailProps) {
  const event = useAppStore((s) => s.events.find((e) => e.id === eventId));
  const people = useAppStore((s) => s.people);
  const setEventMatchingQuery = useAppStore((s) => s.setEventMatchingQuery);
  const [query, setQuery] = useState(event?.matchingQuery ?? "");
  const [showMatching, setShowMatching] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [organizerOpen, setOrganizerOpen] = useState(false);

  if (!event) {
    return (
      <div className="p-6 text-center">
        <p>Event не найден</p>
        <Link href="/events">← Назад</Link>
      </div>
    );
  }

  const eventPeople = people.filter((p) => p.context.eventId === event.id || p.context.eventName === event.name);

  return (
    <div className="mx-auto max-w-lg px-4 pb-8 pt-4">
      <Link href="/events" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500">
        <ArrowLeft className="h-4 w-4" />
        Events
      </Link>

      <h1 className="text-2xl font-bold">{event.name}</h1>
      <p className="text-sm text-zinc-500">{event.location}</p>
      <p className="mt-2 text-xs text-indigo-600">
        Event Space активен ещё {daysUntil(event.activeUntil)} дней
      </p>

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
          <div className="mb-2 flex items-center gap-2">
            <Search className="h-4 w-4 text-indigo-600" />
            <span className="font-medium">Event Matching</span>
          </div>
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Looking for seed investors for marketplace..."
            rows={2}
            className="mb-2"
          />
          <Button
            size="sm"
            onClick={() => {
              setEventMatchingQuery(event.id, query);
              setShowMatching(true);
            }}
          >
            Найти людей
          </Button>
        </div>

        {showMatching && <MatchingResults query={query} />}

        <div>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="font-medium">People at event ({eventPeople.length})</span>
          </div>
          {eventPeople.length === 0 ? (
            <p className="text-sm text-zinc-500">Контакты с этим мероприятия появятся после обмена</p>
          ) : (
            <div className="space-y-2">
              {eventPeople.map((p) => (
                <PersonCard key={p.id} person={p} />
              ))}
            </div>
          )}
        </div>

        <Button variant="secondary" onClick={() => setBatchOpen(true)} className="w-full">
          Batch AI Summary
        </Button>

        <Button variant="ghost" onClick={() => setOrganizerOpen(true)} className="w-full">
          <BarChart3 className="h-4 w-4" />
          Organizer Analytics (demo)
        </Button>
      </div>

      <BatchSummaryModal open={batchOpen} onClose={() => setBatchOpen(false)} eventName={event.name} />
      <OrganizerDashboard open={organizerOpen} onClose={() => setOrganizerOpen(false)} eventName={event.name} />
    </div>
  );
}
