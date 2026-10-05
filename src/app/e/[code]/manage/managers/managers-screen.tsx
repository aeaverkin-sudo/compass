"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Share } from "lucide-react";
import { SkyToast } from "@/shared/components/sky-toast";
import { Rule } from "@/shared/components/rule";
import { Zone } from "@/shared/components/zone";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { shareInviteLink } from "@/shared/event/share-invite";
import { COLUMN_GAP_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { EVENT_PERMISSIONS, PERMISSION_LABEL, type EventPermission, type EventPermissions } from "@/shared/event/permissions";
import type { EventManager } from "@/shared/services/event-manage";
import { ManageFrame } from "../manage-frame";

type View = "list" | "assign" | "link";

const SKY =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

function emptyPermissions(): EventPermissions {
  return { checkin: false, guests: false, payments: false, analytics: false, edit: false, team: false };
}

function PermissionBoxes({
  permissions,
  disabled,
  onToggle,
  idPrefix,
}: {
  permissions: EventPermissions;
  disabled?: boolean;
  onToggle: (key: EventPermission, checked: boolean) => void;
  idPrefix: string;
}) {
  return (
    <ul>
      {EVENT_PERMISSIONS.map((key) => (
        <li key={key} className="py-1.5">
          <label htmlFor={`${idPrefix}-${key}`} className="flex items-center gap-3">
            <Checkbox
              id={`${idPrefix}-${key}`}
              checked={permissions[key]}
              disabled={disabled}
              onCheckedChange={(value) => onToggle(key, value === true)}
            />
            <span className="t-body text-[var(--ink)]">{PERMISSION_LABEL[key]}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export function ManagersScreen({
  lookup,
  eventName,
  managers,
  canRemove,
  full,
}: {
  lookup: string;
  eventName: string;
  managers: EventManager[];
  canRemove: boolean;
  full: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [rows, setRows] = useState(managers);
  useEffect(() => setRows(managers), [managers]);
  const [draft, setDraft] = useState<EventPermissions>(emptyPermissions);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = `/e/${encodeURIComponent(lookup)}/manage`;

  const share = () => {
    const canShare = typeof navigator.share === "function" ? (data: { title: string; url: string }) => navigator.share(data) : undefined;
    void shareInviteLink(
      { title: eventName, url: link },
      {
        share: canShare,
        writeText: async (value) => {
          if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
          await navigator.clipboard.writeText(value);
        },
      },
    ).then((outcome) => {
      if (outcome === "copied") setNotice("Ссылка скопирована");
    });
  };

  const toggle = async (manager: EventManager, key: EventPermission, checked: boolean) => {
    if (busy) return;
    const next = { ...manager.permissions, [key]: checked };
    setRows((current) => current.map((row) => (row.userId === manager.userId ? { ...row, permissions: next } : row)));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/managers/${manager.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: next }),
      });
      if (!response.ok) {
        setRows((current) => current.map((row) => (row.userId === manager.userId ? manager : row)));
        setError("Could not update the manager.");
        return;
      }
      router.refresh();
    } catch {
      setRows((current) => current.map((row) => (row.userId === manager.userId ? manager : row)));
      setError("Could not update the manager.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/managers/${userId}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Could not remove the manager.");
        return;
      }
      setRows((current) => current.filter((row) => row.userId !== userId));
      router.refresh();
    } catch {
      setError("Could not remove the manager.");
    } finally {
      setBusy(false);
    }
  };

  const createLink = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/managers/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: draft }),
      });
      const body = (await response.json()) as { token?: string; publicToken?: string; error?: string };
      if (!response.ok || !body.token || !body.publicToken) {
        setError(body.error ?? "Could not create the link.");
        return;
      }
      setLink(`${window.location.origin}/e/${body.publicToken}/team/${body.token}`);
      setView("link");
    } catch {
      setError("Could not create the link.");
    } finally {
      setBusy(false);
    }
  };

  const chosen = EVENT_PERMISSIONS.some((key) => draft[key]);

  return (
    <ManageFrame
      title="Managers"
      fallbackHref={back}
      onBack={view === "list" ? undefined : () => setView("list")}
    >
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      {view === "list" ? (
        <>
          <Zone label="Manager" align="start">
            <ul>
              {rows.map((manager, index) => (
                <li key={manager.userId}>
                  {index > 0 ? <Rule /> : null}
                  <div className="py-[18px]">
                    <div className="flex items-center" style={{ gap: COLUMN_GAP_PX }}>
                      {manager.photoUrl ? (
                        <img src={manager.photoUrl} alt="" className="size-10 shrink-0 object-cover" />
                      ) : (
                        <span aria-hidden className="size-10 shrink-0 bg-[#f3f3f3]" />
                      )}
                      <span className="min-w-0 truncate t-body text-[var(--ink)]">{manager.name}</span>
                    </div>
                    <div className="mt-3">
                      <PermissionBoxes
                        idPrefix={manager.userId}
                        permissions={manager.permissions}
                        disabled={busy}
                        onToggle={(key, checked) => void toggle(manager, key, checked)}
                      />
                    </div>
                    {canRemove ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(manager.userId)}
                        className="press mt-2 border-0 bg-transparent p-0 t-meta text-[var(--grey)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Zone>
          {error ? <p className="mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
          <button
            type="button"
            disabled={full || busy}
            onClick={() => {
              setDraft(emptyPermissions());
              setError(null);
              setView("assign");
            }}
            className="press mt-2 border-0 bg-transparent p-0 t-body text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
            style={{ marginLeft: VALUE_AXIS_PX }}
          >
            + Assign manager
          </button>
        </>
      ) : null}
      {view === "assign" ? (
        <>
          <Zone label="Access" align="start">
            <PermissionBoxes
              idPrefix="draft"
              permissions={draft}
              disabled={busy}
              onToggle={(key, checked) => setDraft((current) => ({ ...current, [key]: checked }))}
            />
          </Zone>
          {error ? <p className="mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
          <button
            type="button"
            disabled={!chosen || busy}
            onClick={() => void createLink()}
            className={`mt-2 ${SKY}`}
            style={{ marginLeft: VALUE_AXIS_PX }}
          >
            Create manager link
          </button>
        </>
      ) : null}
      {view === "link" ? (
        <Zone label="Link" align="start">
          <p className="t-body break-all text-[var(--ink)]" style={{ userSelect: "text", WebkitUserSelect: "text" }}>
            {link}
          </p>
          <button
            type="button"
            onClick={share}
            aria-label="Share"
            className="press mt-3 border-0 bg-transparent p-0 text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
          >
            <Share className="size-4" strokeWidth={1.25} aria-hidden />
          </button>
        </Zone>
      ) : null}
    </ManageFrame>
  );
}
