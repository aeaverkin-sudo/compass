"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { BackButton } from "@/shared/components/back-button";
import { SkyToast } from "@/shared/components/sky-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { NetworkTabs } from "./network-tabs";
import { BROWSE_QR_SIZE, HEADER_RHYTHM_PX, RULE_GAP_PX } from "@main/layout";

type SortMode = "recent" | "alphabet" | "event";

type Contact = {
  id: string;
  displayName: string;
  state: "active" | "pending";
  savedCardToken: string;
  sourceEventId: string | null;
  createdAt: string;
  role: string;
  photoUrl: string | null;
};

const HOLD_MS = 500;
/** Same token as the profile zone label. */
const ZONE_LABEL =
  "text-[11px] leading-[1.45] font-normal tracking-[0.1em] whitespace-nowrap text-[#999] uppercase";
/** Two lines above the card's first rule. The back arrow still clears the field by at least 16px. */
const SEARCH_LIFT_PX = 44;
const CARD_LINE_TOP = `calc(env(safe-area-inset-top) + ${HEADER_RHYTHM_PX + BROWSE_QR_SIZE + RULE_GAP_PX - SEARCH_LIFT_PX}px)`;

const SORTS: { id: SortMode; label: string }[] = [
  { id: "recent", label: "Recently added" },
  { id: "alphabet", label: "Alphabet" },
  { id: "event", label: "by Event" },
];

function letterOf(name: string) {
  const char = name.trim().charAt(0).toLocaleUpperCase();
  if (/^\p{L}$/u.test(char)) return char;
  return "#";
}

function whenLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(date);
}

function metaLine(contact: Contact) {
  const when = whenLabel(contact.createdAt);
  if (contact.role && when) return `${contact.role} · ${when}`;
  return contact.role || when;
}

function matchesQuery(contact: Contact, query: string) {
  if (!query) return true;
  const haystack = `${contact.displayName} ${contact.role}`.toLocaleLowerCase();
  return haystack.includes(query);
}

export function NetworkScreen({ addedName = null }: { addedName?: string | null }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [armedId, setArmedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    addedName ? `${addedName} — just added to your contacts` : null,
  );

  const load = async () => {
    const response = await fetch("/api/connections", { cache: "no-store" });
    if (!response.ok) {
      setContacts([]);
      return;
    }
    const body = (await response.json()) as { connections?: Contact[] };
    setContacts(Array.isArray(body.connections) ? body.connections : []);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!addedName) return;
    window.history.replaceState(null, "", "/network");
  }, [addedName]);

  const pending = useMemo(() => {
    return (contacts ?? [])
      .filter((contact) => contact.state === "pending")
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [contacts]);

  const accepted = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (contacts ?? []).filter((contact) => contact.state === "active" && matchesQuery(contact, needle));
  }, [contacts, query]);

  const accept = async (id: string) => {
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { error } = await supabase
      .from("connections")
      .update({ state: "active" })
      .eq("id", id)
      .eq("owner_id", data.user.id);
    if (error) return;
    const name = contacts?.find((contact) => contact.id === id)?.displayName.trim() || "Untitled";
    setContacts((current) =>
      current?.map((contact) => (contact.id === id ? { ...contact, state: "active" } : contact)) ?? current,
    );
    setNotice(`${name} — just added to your contacts`);
  };

  const remove = async (id: string) => {
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { error } = await supabase.from("connections").delete().eq("id", id).eq("owner_id", data.user.id);
    if (error) return;
    setArmedId(null);
    setContacts((current) => current?.filter((contact) => contact.id !== id) ?? current);
  };

  const empty = contacts !== null && contacts.length === 0;

  return (
    <main
      className="compass-main relative flex h-dvh flex-col overflow-hidden bg-white text-[#111]"
      style={{ paddingBottom: "var(--vv-bottom, 0px)" }}
    >
      <BackButton fallbackHref="/main" />
      <div className="pointer-events-none absolute inset-x-0 top-10 z-20 grid h-[22px] grid-cols-[44px_minmax(0,1fr)_44px] items-center px-8">
        <span aria-hidden className="size-[22px]" />
        <h1 className="text-center text-[13px] leading-none font-normal tracking-[0.2em] text-[#111] uppercase">
          Network
        </h1>
      </div>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <div className="flex flex-col justify-end px-8" style={{ height: CARD_LINE_TOP }}>
        <div className="flex items-center gap-3 py-2">
          <Search className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, role, or company"
            aria-label="Name, role, or company"
            className="min-w-0 flex-1 bg-transparent text-[15px] font-normal outline-none placeholder:text-[#999]/60"
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Sort"
              className="inline-flex size-8 items-center justify-center border-0 bg-transparent text-[#111]"
            >
              <SlidersHorizontal className="size-4" strokeWidth={1.5} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORTS.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  className={sort === item.id ? "font-normal" : undefined}
                  onSelect={() => setSort(item.id)}
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mx-8 border-t-[0.5px] border-[#111]" />

      <div className="min-h-0 flex-1 overflow-y-auto px-8">
        {empty ? (
          <p className="flex h-full items-center justify-center text-center text-[15px] font-light leading-snug text-[#999]">
            Your contact list. Exchange a card and your first contact appears here.
          </p>
        ) : (
          <>
            {pending.length > 0 ? (
              <section className="pt-6">
                <ul>
                  {pending.map((contact) => (
                    <WaitingRow
                      key={contact.id}
                      contact={contact}
                      onAccept={() => void accept(contact.id)}
                      onSkip={() => void remove(contact.id)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {sort === "alphabet" ? (
              <AlphabetList
                contacts={accepted}
                armedId={armedId}
                onArm={setArmedId}
                onRemove={(id) => void remove(id)}
              />
            ) : (
              <FlatList
                contacts={groupAccepted(accepted, sort)}
                armedId={armedId}
                onArm={setArmedId}
                onRemove={(id) => void remove(id)}
              />
            )}
          </>
        )}
      </div>

      <NetworkTabs active="connections" />
    </main>
  );
}

function groupAccepted(contacts: Contact[], sort: SortMode) {
  if (sort === "event") {
    const groups = new Map<string, Contact[]>();
    for (const contact of contacts) {
      const key = contact.sourceEventId ?? "";
      const list = groups.get(key) ?? [];
      list.push(contact);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([key, list]) => ({
      key,
      label: key ? "Event" : "",
      contacts: list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }));
  }
  return [
    {
      key: "recent",
      label: "",
      contacts: contacts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    },
  ];
}

function AlphabetList({
  contacts,
  armedId,
  onArm,
  onRemove,
}: {
  contacts: Contact[];
  armedId: string | null;
  onArm: (id: string | null) => void;
  onRemove: (id: string) => void;
}) {
  const groups = new Map<string, Contact[]>();
  for (const contact of contacts) {
    const letter = letterOf(contact.displayName);
    const list = groups.get(letter) ?? [];
    list.push(contact);
    groups.set(letter, list);
  }
  const letters = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  return (
    <>
      {letters.map((letter) => (
        <section key={letter} className="mt-6">
          <div className="border-t-[0.5px] border-[#111] pt-2">
            <p className={`m-0 ${ZONE_LABEL}`}>{letter}</p>
          </div>
          <ul>
            {(groups.get(letter) ?? [])
              .slice()
              .sort((a, b) => a.displayName.localeCompare(b.displayName))
              .map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  armed={armedId === contact.id}
                  onArm={() => onArm(contact.id)}
                  onRemove={() => onRemove(contact.id)}
                />
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function FlatList({
  contacts,
  armedId,
  onArm,
  onRemove,
}: {
  contacts: { key: string; label: string; contacts: Contact[] }[];
  armedId: string | null;
  onArm: (id: string | null) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      {contacts.map((group) => (
        <section key={group.key} className="pt-4">
          {group.label ? (
            <p className={`m-0 pb-1 ${ZONE_LABEL}`}>
              {group.label}
            </p>
          ) : null}
          <ul>
            {group.contacts.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                armed={armedId === contact.id}
                onArm={() => onArm(contact.id)}
                onRemove={() => onRemove(contact.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function WaitingRow({
  contact,
  onAccept,
  onSkip,
}: {
  contact: Contact;
  onAccept: () => void;
  onSkip: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b-[0.5px] border-[#111]/15 py-3 text-[#999]">
      <Face photoUrl={contact.photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[15.5px] leading-[1.25] font-normal">{contact.displayName.trim() || "Untitled"}</p>
        <p className="m-0 mt-0.5 truncate text-[13px] leading-snug font-normal">offered you their card</p>
      </div>
      <button type="button" onClick={onAccept} className="border-0 bg-transparent text-[13px] font-normal underline">
        Accept
      </button>
      <button type="button" onClick={onSkip} className="border-0 bg-transparent text-[13px] font-normal underline">
        Skip
      </button>
    </li>
  );
}

function ContactRow({
  contact,
  armed,
  onArm,
  onRemove,
}: {
  contact: Contact;
  armed: boolean;
  onArm: () => void;
  onRemove: () => void;
}) {
  const longPress = useLongPress(onArm, HOLD_MS);
  return (
    <li
      className="flex items-center gap-3 border-b-[0.5px] border-[#111]/15 py-3"
      {...longPress}
    >
      <Face photoUrl={contact.photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[15.5px] leading-[1.25] font-normal text-[#111]">
          {contact.displayName.trim() || "Untitled"}
        </p>
        {metaLine(contact) ? (
          <p className="m-0 mt-0.5 truncate text-[13px] leading-snug font-normal text-[#999]">{metaLine(contact)}</p>
        ) : null}
      </div>
      {armed ? (
        <button type="button" aria-label="Delete" onClick={onRemove} className="inline-flex size-8 items-center justify-center border-0 bg-transparent text-[#111]">
          <X className="size-4" strokeWidth={1.5} />
        </button>
      ) : (
        <Link href={`/network/c/${contact.savedCardToken}`} className="text-[13px] font-normal text-[#111] underline">
          View
        </Link>
      )}
    </li>
  );
}

function Face({ photoUrl }: { photoUrl: string | null }) {
  return (
    <span className="size-11 shrink-0 bg-[#f3f3f3]">
      {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover" /> : null}
    </span>
  );
}
