"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useAppStore } from "@/shared/store/app-store";
import { PersonCard } from "./person-card";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { seedDemoPerson } from "@/features/people/services/demo-person";

type Tab = "received" | "sent";

export function PeopleScreen() {
  const people = useAppStore((s) => s.people);
  const addPerson = useAppStore((s) => s.addPerson);
  const [tab, setTab] = useState<Tab>("received");

  const filtered = people.filter((p) => p.direction === tab);

  const addDemo = () => {
    addPerson(seedDemoPerson(tab));
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-8">
      <h1 className="mb-1 text-2xl font-bold">People</h1>
      <p className="mb-6 text-sm text-zinc-500">Полученные и переданные портфолио</p>

      <div className="mb-6 flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {(["received", "sent"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-medium transition",
              tab === t ? "bg-white shadow dark:bg-zinc-800" : "text-zinc-500",
            )}
          >
            {t === "received" ? "Полученные" : "Переданные"}
          </button>
        ))}
      </div>

      <Button variant="secondary" onClick={addDemo} className="mb-4 w-full">
        <UserPlus className="h-4 w-4" />
        Добавить demo-контакт
      </Button>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {tab === "received"
            ? "Здесь появятся люди, которые передали вам портфолио"
            : "Здесь появятся люди, которым вы передали портфолио"}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PersonCard key={p.id} person={p} />
          ))}
        </div>
      )}
    </div>
  );
}
