"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ScanButton } from "@/shared/components/scan-icon";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { SkyToast } from "@/shared/components/sky-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { foldSearch } from "@/shared/lib/search-fold";
import { NetworkBand } from "./network-band";

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
  searchText: string;
};

const HOLD_MS = 500;
/** Same token as the profile zone label. */
const ZONE_LABEL = "t-label whitespace-nowrap";

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
  return contact.searchText.includes(query);
}

export function NetworkScreen({ addedName = null }: { addedName?: string | null }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [armedId, setArmedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    addedName ? `${addedName} — just added to your contacts` : null,
  );
  const ownerId = useRef<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/connections", { cache: "no-store" });
    if (!response.ok) {
      setContacts([]);
      return;
    }
    const body = (await response.json()) as { connections?: Contact[] };
    const connections = Array.isArray(body.connections) ? body.connections : [];
    setContacts(
      connections.map((contact) => ({
        ...contact,
        searchText: foldSearch(contact.searchText || `${contact.displayName} ${contact.role}`),
      })),
    );
  };

  useEffect(() => {
    void load();
    void createBrowserSupabaseClient().auth.getSession().then(({ data }) => {
      ownerId.current = data.session?.user.id ?? null;
    });
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
    const needle = foldSearch(query.trim());
    return (contacts ?? []).filter((contact) => contact.state === "active" && matchesQuery(contact, needle));
  }, [contacts, query]);

  const readyOwnerId = async () => {
    if (ownerId.current) return ownerId.current;
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    ownerId.current = data.session?.user.id ?? null;
    return ownerId.current;
  };

  const accept = async (id: string) => {
    const userId = await readyOwnerId();
    if (!userId) return;
    const { error } = await createBrowserSupabaseClient()
      .from("connections")
      .update({ state: "active" })
      .eq("id", id)
      .eq("owner_id", userId);
    if (error) return;
    const name = contacts?.find((contact) => contact.id === id)?.displayName.trim() || "Untitled";
    setContacts((current) =>
      current?.map((contact) => (contact.id === id ? { ...contact, state: "active" } : contact)) ?? current,
    );
    setNotice(`${name} — just added to your contacts`);
  };

  const remove = async (id: string) => {
    const userId = await readyOwnerId();
    if (!userId) return;
    const { error } = await createBrowserSupabaseClient()
      .from("connections")
      .delete()
      .eq("id", id)
      .eq("owner_id", userId);
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
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)]">
        <ScreenHeader
          title="Network"
          fallbackHref="/main"
          onBack={() => router.push("/main")}
          trailing={<ScanButton />}
        />
        <Zone
          label={<Search className="size-4 text-[#111]" strokeWidth={1.5} aria-hidden />}
          rule
          align="center"
        >
          <div className="flex items-center">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, role, company"
              aria-label="Name, role, company"
              className="min-w-0 flex-1 bg-transparent t-body outline-none placeholder:text-[var(--placeholder)]"
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
        </Zone>
        {empty ? (
          <Zone label="Contacts">
            <p className="t-body text-[var(--grey)]">No contacts yet.</p>
            <p className="mt-1 t-meta text-[var(--grey)]">Exchange a card and your first contact appears here.</p>
          </Zone>
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

      <NetworkBand current="network" />
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
          <div className="border-t border-[var(--rule)] pt-2">
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
    <li className="press flex items-center gap-3 border-b border-[var(--rule)] py-3 text-[var(--grey)]">
      <Face photoUrl={contact.photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate t-body">{contact.displayName.trim() || "Untitled"}</p>
        <p className="m-0 mt-0.5 truncate t-meta">offered you their card</p>
      </div>
      <button type="button" onClick={onAccept} className="border-0 bg-transparent t-meta underline">
        Accept
      </button>
      <button type="button" onClick={onSkip} className="border-0 bg-transparent t-meta underline">
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
      className="press flex items-center gap-3 border-b border-[var(--rule)] py-3"
      {...longPress}
    >
      <Face photoUrl={contact.photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate t-body text-[var(--ink)]">
          {contact.displayName.trim() || "Untitled"}
        </p>
        {metaLine(contact) ? (
          <p className="m-0 mt-0.5 truncate t-meta text-[var(--grey)]">{metaLine(contact)}</p>
        ) : null}
      </div>
      {armed ? (
        <button type="button" aria-label="Delete" onClick={onRemove} className="inline-flex size-8 items-center justify-center border-0 bg-transparent text-[#111]">
          <X className="size-4" strokeWidth={1.5} />
        </button>
      ) : (
        <Link href={`/network/c/${contact.savedCardToken}`} className="t-meta text-[var(--ink)] underline">
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
