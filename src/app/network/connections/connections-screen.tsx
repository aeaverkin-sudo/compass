"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { BackButton } from "@/shared/components/back-button";
import { cn } from "@/lib/utils";
import { useKeyboardDock } from "@main/hooks/use-keyboard-dock";
import { NetworkTabs } from "../network-tabs";
import { RULE_TOP, RULE_BOTTOM } from "@/shared/lib/rule";

const LABEL = "text-[11px] leading-[1.45] font-normal tracking-[0.1em] text-[#999] uppercase";

const FROZEN = { filter: "blur(4.5px)", opacity: 0.42 } as const;

const FIELD_MAX = "calc(16px * 1.45 * 5)";
const QUERY_MAX = "calc(25px * 1.45 * 5)";

type Match = {
  id: string;
  name: string;
  why: string;
  photoUrl: string | null;
};

const TEASER: Match[] = [
  { id: "teaser-1", name: "Inês Carvalho", why: "Photographs objects for Lisbon studios", photoUrl: null },
  { id: "teaser-2", name: "Noah Pell", why: "Still life, wine, and print", photoUrl: null },
];

function isMatch(value: unknown): value is Match {
  if (!value || typeof value !== "object") return false;
  const row = value as Match;
  return typeof row.id === "string" && typeof row.name === "string" && typeof row.why === "string";
}

function resizeField(field: HTMLTextAreaElement) {
  field.style.height = "auto";
  const max = 16 * 1.45 * 5;
  const next = Math.min(field.scrollHeight, max);
  field.style.height = `${next}px`;
  field.style.overflowY = field.scrollHeight > max + 1 ? "auto" : "hidden";
}

export function ConnectionsScreen() {
  const [composing, setComposing] = useState(true);
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [busy, setBusy] = useState(false);
  const inset = useKeyboardDock(composing);

  const submit = async () => {
    const query = draft.trim();
    if (!query || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/network/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const body = (await response.json().catch(() => null)) as { matches?: unknown } | null;
      const list = Array.isArray(body?.matches) ? body.matches.filter(isMatch) : [];
      setAsked(query);
      setMatches(list);
      setComposing(false);
    } catch {
      setAsked(query);
      setMatches([]);
      setComposing(false);
    } finally {
      setBusy(false);
    }
  };

  const edit = () => {
    setDraft(asked ?? "");
    setComposing(true);
  };

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[#111]">
      <div className="shrink-0 px-8">
        <BackButton fallbackHref="/network" />
        <div className="mt-10 mb-[18px] grid h-[22px] grid-cols-[44px_minmax(0,1fr)_44px] items-center">
          <span aria-hidden className="size-[22px]" />
          <h1 className="text-center text-[14px] leading-[1.45] font-normal tracking-[0.1em] text-[#111] uppercase">
            Connections
          </h1>
        </div>
      </div>

      {asked && !composing ? <PinnedQuery text={asked} onEdit={edit} /> : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {asked && matches && !composing ? (
          matches.length === 0 ? (
            <EmptyResults />
          ) : (
            <div className="px-8 pb-8">
              <p className={`pt-[18px] ${LABEL}`}>In your network</p>
              <ul>
                {matches.map((match) => (
                  <MatchRow key={match.id} match={match} />
                ))}
              </ul>
              <Worldwide />
            </div>
          )
        ) : null}
      </div>

      {composing ? (
        <Composer value={draft} inset={inset} busy={busy} onChange={setDraft} onSubmit={() => void submit()} />
      ) : (
        <NetworkTabs />
      )}
    </main>
  );
}

function PinnedQuery({ text, onEdit }: { text: string; onEdit: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    setOverflow(node.scrollHeight > node.clientHeight + 1);
  }, [text]);

  return (
    <div className={cn("shrink-0 px-8 py-[18px]", RULE_BOTTOM)}>
      <button type="button" onClick={onEdit} className="block w-full border-0 bg-transparent p-0 text-left">
        <p className={LABEL}>Looking for</p>
        <div className="relative mt-2">
          <div ref={scroller} className="overflow-y-auto" style={{ maxHeight: QUERY_MAX }}>
            <p className="text-[25px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111]">{text}</p>
          </div>
          {overflow ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-11 bg-gradient-to-b from-white to-transparent"
            />
          ) : null}
        </div>
      </button>
    </div>
  );
}

function Composer({
  value,
  inset,
  busy,
  onChange,
  onSubmit,
}: {
  value: string;
  inset: number;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    resizeField(node);
    node.focus();
  }, []);

  return (
    <form
      className={cn("shrink-0 bg-white px-8 py-3", RULE_TOP)}
      style={{ marginBottom: inset }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-end gap-3">
        <textarea
          ref={field}
          value={value}
          rows={1}
          enterKeyHint="send"
          placeholder="A product photographer in Lisbon…"
          aria-label="Looking for"
          className="min-h-[calc(16px*1.45)] w-full flex-1 resize-none bg-transparent text-[16px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111] caret-[#111] outline-none placeholder:text-[#999]"
          style={{ maxHeight: FIELD_MAX }}
          onChange={(event) => {
            onChange(event.target.value);
            resizeField(event.target);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            onSubmit();
          }}
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={busy || value.trim().length === 0}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border-0 bg-sky text-[#111] disabled:opacity-40"
        >
          <ArrowUp className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </form>
  );
}

function MatchRow({ match, quiet = false }: { match: Match; quiet?: boolean }) {
  return (
    <li className={cn("flex items-center gap-3 py-3", RULE_BOTTOM)}>
      <span className="size-14 shrink-0 bg-[#f3f3f3]">
        {match.photoUrl ? <img src={match.photoUrl} alt="" className="size-full object-cover" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[15.5px] leading-[1.25] font-normal text-[#111]">
          {match.name.trim() || "Untitled"}
        </p>
        {match.why ? (
          <p className="m-0 mt-0.5 text-[16px] leading-[1.45] font-normal text-[#999]">{match.why}</p>
        ) : null}
      </div>
      {quiet ? (
        <span className="shrink-0 text-[13px] font-normal text-[#111] underline decoration-[#111] decoration-[0.5px] underline-offset-[3px]">
          Request
        </span>
      ) : (
        <button
          type="button"
          className="shrink-0 border-0 bg-transparent p-0 text-[13px] font-normal text-[#111] underline decoration-[#111] decoration-[0.5px] underline-offset-[3px]"
        >
          Request
        </button>
      )}
    </li>
  );
}

function Worldwide() {
  return (
    <div className="mt-8" aria-hidden>
      <p className={LABEL}>Worldwide matches in Pro</p>
      <ul className="mt-3" style={FROZEN}>
        {TEASER.map((match) => (
          <MatchRow key={match.id} match={match} quiet />
        ))}
      </ul>
    </div>
  );
}

function EmptyResults() {
  return (
    <div className="flex h-full min-h-full flex-col">
      <p className="flex flex-1 items-center justify-center px-8 text-center text-[15px] leading-snug font-light text-[#999]">
        No matches yet — it&apos;s a startup. Nobody&apos;s here but us. Try anyway
      </p>
      <div className="px-8 pb-8">
        <Worldwide />
      </div>
    </div>
  );
}
