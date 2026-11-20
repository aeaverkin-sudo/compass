"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCw, Search, SlidersHorizontal } from "lucide-react";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SkyActions } from "@/shared/components/sky-actions";
import { Zone } from "@/shared/components/zone";
import { SkyToast } from "@/shared/components/sky-toast";
import { UndoRow } from "@/shared/components/pending-decision";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useCardsHydrated } from "@/shared/hooks/use-cards-hydrated";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { recallAnswer, rememberAnswer } from "@/shared/lib/last-answer";
import {
  acceptConnection,
  declineConnection,
  releaseIfAccepted,
  undoDecline,
  useConnectionDecisions,
} from "@/shared/lib/connection-decision";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { deleteConnectionRemote } from "@/shared/lib/delete-connection";
import { clearNewContact } from "@/shared/lib/new-contact";
import { markIncomingSeen } from "@/shared/lib/network-dot";
import { foldSearch } from "@/shared/lib/search-fold";
import { photoLookValue, photoSlotLookClass, shownPhotoLook, type StoredPhotoLook } from "@/shared/lib/photo-look";
import { cn } from "@/lib/utils";
import { MARK_PX, MarkPlus, RAIL_STROKE_PX } from "@/shared/components/mark-plus";
import { RAIL_ICON_SCALE } from "@main/components/side-rail";
import { forgetShareBack, sendShareBack, useShareBack } from "@/shared/lib/share-back-send";
import { SharePick, useNamedShareCards, type SharePickCard } from "@/shared/components/share-pick";
import { useAppStore } from "@/shared/store/app-store";
import { NetworkBand } from "./network-band";

type SortMode = "recent" | "alphabet";

type Contact = {
  id: string;
  displayName: string;
  state?: "active" | "pending";
  savedCardToken: string;
  sourceEventId: string | null;
  createdAt: string;
  role: string;
  photoUrl: string | null;
  /** Owner’s choice on an exchanged card. Manual contacts stay on the default shadow. */
  photoLook?: StoredPhotoLook;
  searchText: string;
  /** Their book already holds my primary card. */
  theyHaveMe?: boolean;
  /** My share back is still a request in their book. */
  shareBackPending?: boolean;
  /** Saved by hand, scan, voice, or photo. Not an ADED card. */
  collected?: boolean;
  /** A collected contact already sent a portfolio back. */
  pushed?: boolean;
};

const HOLD_MS = 500;
const CONTACTS_KEY = "connections";
/** Same token as the profile zone label. */
const ZONE_LABEL = "t-label whitespace-nowrap";

const SORTS: { id: SortMode; label: string }[] = [
  { id: "recent", label: "Recently added" },
  { id: "alphabet", label: "Alphabet" },
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

function isRequest(contact: Contact, accepting: ReadonlySet<string>) {
  return contact.state === "pending" && !accepting.has(contact.id);
}

function matchesQuery(contact: Contact, query: string) {
  if (!query) return true;
  return contact.searchText.includes(query);
}

type CollectedWire = {
  id?: unknown;
  displayName?: unknown;
  position?: unknown;
  photoUrl?: unknown;
  createdAt?: unknown;
  searchText?: unknown;
  pushbackAt?: unknown;
};

function collectedContact(row: CollectedWire): Contact | null {
  if (typeof row.id !== "string" || typeof row.displayName !== "string") return null;
  return {
    id: row.id,
    displayName: row.displayName,
    state: "active",
    savedCardToken: "",
    sourceEventId: null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    role: typeof row.position === "string" ? row.position.trim() : "",
    photoUrl: typeof row.photoUrl === "string" && row.photoUrl ? row.photoUrl : null,
    searchText: foldSearch(typeof row.searchText === "string" ? row.searchText : row.displayName),
    collected: true,
    pushed: typeof row.pushbackAt === "string" && row.pushbackAt.length > 0,
  };
}

type HoldMenu = { id: string; top: number; left: number; width: number; confirmDelete: boolean; picking: boolean };

export function NetworkScreen({ addedName = null }: { addedName?: string | null }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[] | null>(() => recallAnswer<Contact[]>(CONTACTS_KEY));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [menu, setMenu] = useState<HoldMenu | null>(null);
  const [pickUp, setPickUp] = useState(false);
  const shareCards = useNamedShareCards();
  const cardsReady = useCardsHydrated();
  const cardCount = useAppStore((state) => state.cards.length);
  const [notice, setNotice] = useState<string | null>(
    addedName ? `${addedName} — just added to your contacts` : null,
  );
  const ownerId = useRef<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const plaqueRef = useRef<HTMLDivElement>(null);
  const arming = useRef(false);
  const swallowClick = useRef(false);
  const decisions = useConnectionDecisions();

  const [loadError, setLoadError] = useState(false);
  const [canCollect, setCanCollect] = useState(true);

  const load = useCallback(async () => {
    try {
      // Book and collected list in parallel — do not wait on one before the other.
      const [response, probe] = await Promise.all([
        fetch("/api/connections", { cache: "no-store" }),
        fetch("/api/external-contacts", { cache: "no-store" }).catch(() => null),
      ]);
      if (!response.ok) {
        setLoadError(true);
        return;
      }
      const body = (await response.json()) as { connections?: Contact[] };
      const connections = Array.isArray(body.connections) ? body.connections : [];
      for (const contact of connections) {
        if (contact.state !== "pending") releaseIfAccepted(contact.id);
      }
      const book: Contact[] = connections.map((contact) => ({
        ...contact,
        state: contact.state === "pending" ? "pending" : "active",
        photoLook: photoLookValue(contact.photoLook),
        searchText: foldSearch(contact.searchText || `${contact.displayName} ${contact.role}`),
      }));
      let collected: Contact[] = [];
      try {
        const probeBody = probe?.ok
          ? ((await probe.json()) as { available?: boolean; contacts?: CollectedWire[] })
          : null;
        setCanCollect(probeBody?.available === true);
        if (probeBody?.available === true && Array.isArray(probeBody.contacts)) {
          collected = probeBody.contacts.flatMap((row) => {
            const contact = collectedContact(row);
            return contact ? [contact] : [];
          });
        }
      } catch {
        setCanCollect(false);
      }
      setContacts([...book, ...collected]);
      setLoadError(false);
      markIncomingSeen(connections.filter((contact) => contact.state === "pending").map((contact) => contact.id));
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    clearNewContact();
    void load();
    void createBrowserSupabaseClient().auth.getSession().then(({ data }) => {
      ownerId.current = data.session?.user.id ?? null;
    });
  }, [load]);

  useEffect(() => {
    if (!loadError) return;
    const retry = () => {
      void load();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, loadError]);

  useEffect(() => {
    const lift = () => {
      if (!arming.current) return;
      arming.current = false;
      swallowClick.current = true;
      window.setTimeout(() => {
        swallowClick.current = false;
      }, 0);
    };
    document.addEventListener("pointerup", lift);
    return () => document.removeEventListener("pointerup", lift);
  }, []);

  useLayoutEffect(() => {
    if (!menu?.picking) return;
    const node = plaqueRef.current;
    const band = node?.ownerDocument.querySelector("nav.compass-sky-band");
    const list = node?.querySelector("[data-share-pick]");
    if (!band || !list) return;
    const overflows = list.getBoundingClientRect().bottom > band.getBoundingClientRect().top - 4;
    if (overflows) setPickUp(true);
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      const node = plaqueRef.current;
      if (node && event.target instanceof Node && node.contains(event.target)) return;
      setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  useEffect(() => {
    if (contacts) {
      rememberAnswer(
        CONTACTS_KEY,
        contacts
          .filter((contact) => !decisions.gone.has(contact.id))
          .map((contact) =>
            decisions.accepting.has(contact.id) ? { ...contact, state: "active" as const } : contact,
          ),
      );
    }
  }, [contacts, decisions]);

  useEffect(() => {
    if (!addedName) return;
    window.history.replaceState(null, "", "/network");
  }, [addedName]);

  const book = useMemo(
    () => (contacts ?? []).filter((contact) => !decisions.gone.has(contact.id)),
    [contacts, decisions],
  );

  const shown = useMemo(() => {
    const needle = foldSearch(query.trim());
    return book.filter((contact) => matchesQuery(contact, needle));
  }, [book, query]);
  const requests = shown.filter((contact) => isRequest(contact, decisions.accepting));
  const people = shown.filter((contact) => !isRequest(contact, decisions.accepting));
  const menuContact = menu ? book.find((contact) => contact.id === menu.id) ?? null : null;
  const sharePhase = useShareBack(menuContact?.savedCardToken ?? "");
  const canSwap = Boolean(
    shareCards.length > 0 &&
      menuContact &&
      !menuContact.collected &&
      !menuContact.theyHaveMe &&
      !menuContact.shareBackPending &&
      sharePhase === "idle",
  );
  const swapLocked = Boolean(
    cardsReady &&
      cardCount === 0 &&
      menuContact &&
      !menuContact.collected &&
      !menuContact.theyHaveMe &&
      !menuContact.shareBackPending &&
      sharePhase === "idle",
  );

  const readyOwnerId = async () => {
    if (ownerId.current) return ownerId.current;
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    ownerId.current = data.session?.user.id ?? null;
    return ownerId.current;
  };

  const remove = async (id: string) => {
    const index = contacts?.findIndex((contact) => contact.id === id) ?? -1;
    const before = index >= 0 ? contacts?.[index] : undefined;
    if (!before || before.collected || inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setMenu(null);
    setContacts((current) => current?.filter((contact) => contact.id !== id) ?? current);
    const drop = async () => {
      const userId = await readyOwnerId();
      if (!userId) return false;
      return deleteConnectionRemote(id);
    };
    try {
      let dropped = false;
      try {
        dropped = await drop();
      } catch {
        dropped = false;
      }
      if (!dropped) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        try {
          dropped = await drop();
        } catch {
          dropped = false;
        }
      }
      if (!dropped) {
        setContacts((current) => {
          if (!current) return current;
          const next = [...current];
          next.splice(Math.min(index, next.length), 0, before);
          return next;
        });
      } else {
        forgetShareBack(before.savedCardToken);
      }
    } finally {
      inFlight.current.delete(id);
    }
  };

  const empty = contacts !== null && people.length === 0 && requests.length === 0;

  const removeCollected = async (id: string) => {
    const index = contacts?.findIndex((contact) => contact.id === id) ?? -1;
    const before = index >= 0 ? contacts?.[index] : undefined;
    if (!before?.collected || inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setMenu(null);
    setContacts((current) => current?.filter((contact) => contact.id !== id) ?? current);
    let dropped = false;
    try {
      const response = await fetch(`/api/external-contacts/${id}`, { method: "DELETE" });
      dropped = response.ok;
    } catch {
      dropped = false;
    }
    if (!dropped) {
      setContacts((current) => {
        if (!current) return current;
        const next = [...current];
        next.splice(Math.min(index, next.length), 0, before);
        return next;
      });
    }
    inFlight.current.delete(id);
  };

  const openMenu = (contact: Contact, box: DOMRect) => {
    arming.current = true;
    setPickUp(false);
    setMenu({ id: contact.id, top: box.top, left: box.left, width: box.width, confirmDelete: false, picking: false });
  };

  const shareCard = async (card: SharePickCard) => {
    const contact = menuContact;
    if (!contact || contact.collected) return;
    const sent = await sendShareBack(contact.savedCardToken, card.id);
    if (sent === "failed") return;
    setPickUp(false);
    setMenu(null);
    setNotice(sent === "declined" ? "Not accepting swaps." : `${card.name} shared back`);
  };

  const pressMenu = (run: () => void) => {
    if (swallowClick.current) return;
    run();
  };

  const requestMenu = menuContact ? isRequest(menuContact, decisions.accepting) : false;

  return (
    <main
      className="compass-main relative flex flex-col overflow-hidden bg-white text-[#111]"
    >
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)]">
        <div className="network-scroll-spring">
          <ScreenHeader
            title="Network"
            fallbackHref="/main"
            onBack={() => router.push("/main")}
            trailing={
              canCollect ? (
                <Link
                  href="/network/new"
                  aria-label="New contact"
                  className="press pointer-events-auto flex size-11 items-center justify-end overflow-visible text-[#111]"
                >
                  {/* Lucide Plus sits ~4px inside its box; shift ink to the right card axis. */}
                  <MarkPlus size={23} className="translate-x-[4px]" />
                </Link>
              ) : null
            }
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
          {requests.length > 0 ? (
            <section className="pt-4">
              <p className={`m-0 pb-1 ${ZONE_LABEL}`}>Shared their card with you</p>
              <ul>
                {requests.map((contact) => (
                  <ContactRow key={contact.id} contact={contact} veiled onHold={(box) => openMenu(contact, box)} />
                ))}
              </ul>
            </section>
          ) : null}
          {loadError && (contacts == null || contacts.length === 0) ? (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                aria-label="Try again"
                onClick={() => void load()}
                className="flex size-11 items-center justify-center border-0 bg-transparent p-0 text-[var(--grey)] [&_svg_*]:[vector-effect:non-scaling-stroke]"
              >
                <RotateCw size={MARK_PX * RAIL_ICON_SCALE} strokeWidth={RAIL_STROKE_PX} aria-hidden />
              </button>
            </div>
          ) : empty ? (
            <section className="pt-4">
              <p className={`m-0 pb-1 ${ZONE_LABEL}`}>Contacts</p>
              <p className="t-body text-[var(--grey)]">No contacts yet.</p>
              <p className="mt-1 t-meta text-[var(--grey)]">Exchange a card and your first contact appears here.</p>
            </section>
          ) : people.length > 0 ? (
            sort === "alphabet" ? (
              <AlphabetList contacts={people} onHold={openMenu} />
            ) : (
              <FlatList contacts={groupAccepted(people)} onHold={openMenu} />
            )
          ) : null}
        </div>
      </div>

      <NetworkBand current="network" />
      {menu && menuContact ? (
        <div
          ref={plaqueRef}
          className="fixed z-40"
          style={{ top: menu.top, left: menu.left, width: menu.width }}
        >
          {menuContact.collected ? (
            <SkyActions
              actions={[
                {
                  label: menu.confirmDelete ? "Delete?" : "Delete",
                  tone: "ink",
                  onPress: () => {
                    pressMenu(() => {
                      if (!menu.confirmDelete) {
                        setMenu({ ...menu, confirmDelete: true });
                        return;
                      }
                      void removeCollected(menu.id);
                    });
                  },
                },
                {
                  label: "Edit",
                  tone: menu.confirmDelete ? "grey" : "ink",
                  onPress: () => {
                    pressMenu(() => {
                      if (menu.confirmDelete) {
                        setMenu({ ...menu, confirmDelete: false });
                        return;
                      }
                      setMenu(null);
                      router.push(`/network/x/${menu.id}/edit`);
                    });
                  },
                },
                {
                  label: "Swap",
                  tone: menuContact.pushed ? "grey" : "ink",
                  disabled: Boolean(menuContact.pushed),
                  onPress: () => {
                    pressMenu(() => {
                      if (menu.confirmDelete) {
                        setMenu({ ...menu, confirmDelete: false });
                        return;
                      }
                      if (menuContact.pushed) return;
                      setMenu(null);
                      router.push(`/network/x/${menu.id}/push`);
                    });
                  },
                },
              ]}
            />
          ) : requestMenu ? (
            <SkyActions
              actions={[
                {
                  label: "Skip",
                  tone: "ink",
                  onPress: () => {
                    pressMenu(() => {
                      declineConnection(menuContact.id);
                      setMenu(null);
                    });
                  },
                },
                {
                  label: "Confirm",
                  tone: "ink",
                  onPress: () => {
                    pressMenu(() => {
                      acceptConnection(menuContact.id);
                      setMenu(null);
                    });
                  },
                },
              ]}
            />
          ) : (
            <div className="relative bg-sky">
              {menu.picking && pickUp ? (
                <div data-share-pick className="absolute right-0 bottom-full left-0 bg-sky px-4 pt-3 pb-2">
                  <SharePick cards={shareCards} size="menu" onPick={(card) => void shareCard(card)} />
                </div>
              ) : null}
              <div data-share-actions>
                <SkyActions
                  actions={[
                    {
                      label: menu.confirmDelete ? "Delete?" : "Delete",
                      tone: menu.picking ? "grey" : "ink",
                      onPress: () => {
                        pressMenu(() => {
                          if (menu.picking) {
                            setPickUp(false);
                            setMenu({ ...menu, picking: false });
                            return;
                          }
                          if (!menu.confirmDelete) {
                            setMenu({ ...menu, confirmDelete: true });
                            return;
                          }
                          void remove(menu.id);
                        });
                      },
                    },
                    ...(canSwap
                      ? [
                          {
                            label: "Swap",
                            tone: "ink" as const,
                            onPress: () => {
                              pressMenu(() => {
                                if (menu.picking) return;
                                if (shareCards.length === 1) {
                                  void shareCard(shareCards[0]!);
                                  return;
                                }
                                if (shareCards.length < 2) return;
                                setPickUp(false);
                                setMenu({ ...menu, picking: true, confirmDelete: false });
                              });
                            },
                          },
                        ]
                      : swapLocked
                        ? [
                            {
                              label: "Swap",
                              tone: "grey" as const,
                              onPress: () => {
                                pressMenu(() => {
                                  setMenu(null);
                                  setNotice("Create a portfolio to swap.");
                                });
                              },
                            },
                          ]
                        : []),
                  ]}
                />
              </div>
              {menu.picking && !pickUp ? (
                <div data-share-pick className="bg-sky px-4 pt-2 pb-3">
                  <SharePick cards={shareCards} size="menu" onPick={(card) => void shareCard(card)} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}

function groupAccepted(contacts: Contact[]) {
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
  onHold,
}: {
  contacts: Contact[];
  onHold: (contact: Contact, box: DOMRect) => void;
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
      {letters.map((letter, index) => {
        const rows = (groups.get(letter) ?? []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
        return (
          <section key={letter}>
            <div className={index === 0 ? "pt-2" : "border-t border-[var(--rule)] pt-2"}>
              <p className={`m-0 ${ZONE_LABEL}`}>{letter}</p>
            </div>
            <ul>
              {rows.map((contact, row) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  divider={row < rows.length - 1}
                  onHold={(box) => onHold(contact, box)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function FlatList({
  contacts,
  onHold,
}: {
  contacts: { key: string; label: string; contacts: Contact[] }[];
  onHold: (contact: Contact, box: DOMRect) => void;
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
              <ContactRow key={contact.id} contact={contact} onHold={(box) => onHold(contact, box)} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function ContactRow({
  contact,
  onHold,
  veiled = false,
  divider = true,
}: {
  contact: Contact;
  onHold: (box: DOMRect) => void;
  veiled?: boolean;
  /** Alphabet hides this on the last row of a letter. The next letter's line is the divider. */
  divider?: boolean;
}) {
  const decisions = useConnectionDecisions();
  const removing = decisions.removing.has(contact.id);
  const box = useRef<DOMRect | null>(null);
  const longPress = useLongPress(() => {
    if (box.current) onHold(box.current);
  }, HOLD_MS);
  const rule = divider ? "border-b border-[var(--rule)]" : "";
  if (removing) {
    return (
      <li className={`py-3 ${rule}`}>
        <UndoRow onUndo={() => undoDecline(contact.id)} />
      </li>
    );
  }
  const line = metaLine(contact);
  const rowClass =
    "press flex min-w-0 flex-1 items-center gap-3 py-3 text-inherit no-underline select-none [-webkit-touch-callout:none]";
  const point = {
    ...longPress,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      box.current = event.currentTarget.getBoundingClientRect();
      longPress.onPointerDown(event);
    },
  };
  const body = (
    <>
      <Face photoUrl={contact.photoUrl} photoLook={contact.collected ? "shadow" : contact.photoLook} />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate t-body text-[var(--ink)]">{contact.displayName.trim() || "Untitled"}</p>
        {line ? <p className="m-0 mt-0.5 truncate t-meta text-[var(--grey)]">{line}</p> : null}
      </div>
    </>
  );
  return (
    <li className={`${rule}${veiled ? " opacity-60" : ""}`}>
      <Link
        href={contact.collected ? `/network/x/${contact.id}` : `/network/c/${contact.savedCardToken}`}
        className={rowClass}
        draggable={false}
        {...point}
      >
        {body}
      </Link>
    </li>
  );
}

function Face({ photoUrl, photoLook }: { photoUrl: string | null; photoLook?: StoredPhotoLook }) {
  // Empty slots and unset looks use Profile’s default shadow. Plain stays flat.
  const look = photoUrl ? shownPhotoLook(photoLook) : "shadow";
  return (
    <span className={cn("size-11 shrink-0 overflow-visible bg-white", photoSlotLookClass(look))}>
      {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover" /> : null}
    </span>
  );
}
