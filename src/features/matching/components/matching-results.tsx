"use client";

import { MOCK_MATCHING_PROFILES } from "@/shared/constants/mock-data";

interface MatchingResultsProps {
  query: string;
  location?: string;
}

export function MatchingResults({ query, location }: MatchingResultsProps) {
  return (
    <div className="mt-6 space-y-3">
      <p className="text-sm text-zinc-500">
        Результаты для: <strong>{query}</strong>
        {location && <> · {location}</>}
      </p>

      {MOCK_MATCHING_PROFILES.map((profile) => (
        <div
          key={profile.id}
          className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{profile.name}</p>
              <p className="text-sm text-zinc-500">{profile.headline}</p>
            </div>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {profile.relevance}%
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{profile.reason}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {profile.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] dark:bg-zinc-800">
                {tag}
              </span>
            ))}
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] dark:bg-zinc-800">
              📍 {profile.location}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
