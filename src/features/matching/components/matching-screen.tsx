"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Textarea, Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { MatchingResults } from "./matching-results";

export function MatchingScreen() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [showResults, setShowResults] = useState(false);

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-8">
      <h1 className="mb-1 text-2xl font-bold">Matching</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Professional matching — Business / Pro. Опишите, кого ищете.
      </p>

      <div className="rounded-2xl bg-amber-50 p-3 mb-4 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Demo: результаты подготовлены заранее. Реальный matching engine подключим позже.
      </div>

      <Textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ищу фотографа в Лиссабоне / Founder ищет CTO / Investor ищет consumer marketplace..."
        rows={3}
        className="mb-3"
      />

      <div className="relative mb-4">
        <MapPin className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="География: Lisbon, EU, Remote..."
          className="pl-10"
        />
      </div>

      <Button
        onClick={() => setShowResults(true)}
        disabled={!query.trim()}
        className="w-full"
      >
        Найти релевантных людей
      </Button>

      {showResults && <MatchingResults query={query} location={location} />}
    </div>
  );
}
