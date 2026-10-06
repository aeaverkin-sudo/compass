"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zone } from "@/shared/components/zone";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { PermissionBoxes } from "@/shared/event/permission-boxes";
import { shareInviteLink } from "@/shared/event/share-invite";
import {
  EVENT_PERMISSIONS,
  allPermissions,
  emptyPermissions,
  type EventPermission,
  type EventPermissions,
} from "@/shared/event/permissions";
import type { EventManager } from "@/shared/services/event-manage";

const SKY =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

type Preset = "cohost" | "door" | "custom";

function roleName(permissions: EventPermissions): string {
  if (EVENT_PERMISSIONS.every((key) => permissions[key])) return "Co-host";
  const onlyDoor = permissions.checkin && EVENT_PERMISSIONS.every((key) => key === "checkin" || !permissions[key]);
  return onlyDoor ? "Door" : "Custom";
}

function doorPermissions(): EventPermissions {
  return { ...emptyPermissions(), checkin: true };
}

export function TeamZone({
  lookup,
  eventName,
  managers,
  canRemove,
  full,
  onNotice,
}: {
  lookup: string;
  eventName: string;
  managers: EventManager[];
  canRemove: boolean;
  full: boolean;
  onNotice: (text: string) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(managers);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState<Preset>("cohost");
  const [custom, setCustom] = useState<EventPermissions>(allPermissions());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRows(managers), [managers]);

  const draft = preset === "door" ? doorPermissions() : preset === "custom" ? custom : allPermissions();

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
      setOpenId(null);
      router.refresh();
    } catch {
      setError("Could not remove the manager.");
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
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
      const url = `${window.location.origin}/e/${body.publicToken}/team/${body.token}`;
      const title = `Help me run ${eventName}`;
      const canShare = typeof navigator.share === "function" ? (data: { title: string; url: string }) => navigator.share(data) : undefined;
      const outcome = await shareInviteLink(
        { title, url },
        {
          share: canShare,
          writeText: async (value) => {
            if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
            await navigator.clipboard.writeText(value);
          },
        },
      );
      if (outcome === "copied") onNotice("Link copied");
      setAdding(false);
      setPreset("cohost");
    } catch {
      setError("Could not create the link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Zone label="Team" align={rows.length === 0 ? "baseline" : "start"}>
      {rows.length > 0 ? (
      <ul>
        {rows.map((manager) => {
          const open = openId === manager.userId;
          return (
            <li key={manager.userId} className="py-2">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : manager.userId)}
                className="press flex w-full items-center gap-3 border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
              >
                {manager.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={manager.photoUrl} alt="" className="size-10 shrink-0 object-cover" />
                ) : (
                  <span aria-hidden className="size-10 shrink-0 bg-[#f3f3f3]" />
                )}
                <span className="min-w-0">
                  <span className="block truncate t-body text-[var(--ink)]">{manager.name}</span>
                  <span className="mt-0.5 block t-meta text-[var(--grey)]">{roleName(manager.permissions)}</span>
                </span>
              </button>
              {open ? (
                <div className="pt-2">
                  <PermissionBoxes
                    idPrefix={manager.userId}
                    permissions={manager.permissions}
                    disabled={busy}
                    onToggle={(key, checked) => void toggle(manager, key, checked)}
                  />
                  {canRemove ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(manager.userId)}
                      className="press mt-1 border-0 bg-transparent p-0 t-meta text-[var(--grey)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      ) : null}
      <button
        type="button"
        disabled={full || busy}
        onClick={() => {
          setAdding((current) => !current);
          setPreset("cohost");
          setError(null);
        }}
        className={`press ${rows.length > 0 ? "mt-2 " : ""}border-0 bg-transparent p-0 t-body text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]`}
      >
        + Add co-host
      </button>
      {full ? <p className="mt-1 mb-0 t-meta text-[var(--grey)]">Up to 5 people.</p> : null}
      {adding && !full ? (
        <div className="pt-4">
          <p className="mb-3 t-label">New</p>
          {preset === "custom" ? (
            <PermissionBoxes
              idPrefix="draft"
              permissions={custom}
              disabled={busy}
              onToggle={(key, checked) => setCustom((current) => ({ ...current, [key]: checked }))}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex items-start gap-3">
                <Checkbox checked={preset === "cohost"} onCheckedChange={() => setPreset("cohost")} />
                <span>
                  <span className="block t-body text-[var(--ink)]">Co-host</span>
                  <span className="mt-0.5 block t-meta text-[var(--grey)]">Everything: guests, invites, payment, edit, check-in.</span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <Checkbox checked={preset === "door"} onCheckedChange={() => setPreset("door")} />
                <span>
                  <span className="block t-body text-[var(--ink)]">Door</span>
                  <span className="mt-0.5 block t-meta text-[var(--grey)]">Check-in only.</span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setCustom(preset === "door" ? doorPermissions() : allPermissions());
                  setPreset("custom");
                }}
                className="press border-0 bg-transparent p-0 text-left t-meta text-[var(--grey)] [-webkit-tap-highlight-color:transparent]"
              >
                Custom access
              </button>
            </div>
          )}
          <button type="button" disabled={busy} onClick={() => void sendLink()} className={`mt-4 ${SKY}`}>
            Send link
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-3 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
    </Zone>
  );
}
