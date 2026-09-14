"use client";

import Link from "next/link";
import type { Person } from "@/shared/types";
import { formatDate } from "@/shared/lib/utils";

interface PersonCardProps {
  person: Person;
}

export function PersonCard({ person }: PersonCardProps) {
  const photo = person.showSelfie && person.selfiePhoto ? person.selfiePhoto : person.photo;

  return (
    <Link
      href={`/people/${person.id}`}
      className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition active:scale-[0.99] dark:bg-zinc-900 dark:ring-zinc-800"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-400 to-violet-500">
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-lg font-bold text-white">
            {person.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{person.name}</p>
        <p className="truncate text-sm text-zinc-500">{person.headline}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-400">
          {person.context.eventName && <span>{person.context.eventName}</span>}
          {person.context.location && <span>· {person.context.location}</span>}
          <span>· {formatDate(person.context.date)}</span>
        </div>
      </div>
      {person.privateSave && (
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] dark:bg-zinc-800">Private</span>
      )}
    </Link>
  );
}
