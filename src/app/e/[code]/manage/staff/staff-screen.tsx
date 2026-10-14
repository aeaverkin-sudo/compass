"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Rule } from "@/shared/components/rule";
import { SkyToast } from "@/shared/components/sky-toast";
import { Zone } from "@/shared/components/zone";
import { useBusyAction } from "@/shared/hooks/use-busy-action";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { PermissionBoxes } from "@/shared/event/permission-boxes";
import { shareInviteLink } from "@/shared/event/share-invite";
import {
  EVENT_PERMISSIONS,
  allPermissions,
  emptyPermissions,
  staffRole,
  type EventPermission,
  type EventPermissions,
} from "@/shared/event/permissions";
import type { EventManager } from "@/shared/services/event-manage";
import { ManageFrame } from "../manage-frame";

const SKY =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

type Preset = "manager" | "door" | "guests" | "custom";

const ROOM: Record<EventPermission, string> = {
  edit: "Event",
  payments: "Payment",
  guests: "Guests",
  team: "Staff",
  analytics: "Statistics",
  checkin: "Scanner",
};

function only(key: EventPermission): EventPermissions {
  return { ...emptyPermissions(), [key]: true };
}

function rooms(permissions: EventPermissions): string {
  if (EVENT_PERMISSIONS.every((key) => permissions[key])) return "All rooms";
  const open = EVENT_PERMISSIONS.filter((key) => permissions[key]).map((key) => ROOM[key]);
  return open.length > 0 ? open.join(", ") : "No rooms";
}

const PRESETS: { id: Exclude<Preset, "custom">; label: string; permissions: () => EventPermissions }[] = [
  { id: "manager", label: "Manager", permissions: allPermissions },
  { id: "door", label: "Door", permissions: () => only("checkin") },
  { id: "guests", label: "Guest list", permissions: () => only("guests") },
];

export function StaffScreen({
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
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const [rows, setRows] = useState(managers);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState<Preset>("manager");
  const [custom, setCustom] = useState<EventPermissions>(allPermissions());
  const { busy: running, run } = useBusyAction<"save" | "remove" | "link">();
  const busy = running !== null;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [shown, setShown] = useState(managers);
  if (shown !== managers) {
    setShown(managers);
    setRows(managers);
  }

  const draft = preset === "custom" ? custom : (PRESETS.find((item) => item.id === preset)?.permissions() ?? allPermissions());

  const toggle = (manager: EventManager, key: EventPermission, checked: boolean) =>
    run("save", async () => {
      const next = { ...manager.permissions, [key]: checked };
      setRows((current) => current.map((row) => (row.userId === manager.userId ? { ...row, permissions: next } : row)));
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
        }
      } catch {
        setRows((current) => current.map((row) => (row.userId === manager.userId ? manager : row)));
        setError("Could not update the manager.");
      }
    });

  const remove = (userId: string) =>
    run("remove", async () => {
      setError(null);
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/managers/${userId}`, { method: "DELETE" });
        if (!response.ok) {
          setError("Could not remove the manager.");
          return;
        }
        setRows((current) => current.filter((row) => row.userId !== userId));
        setOpenId(null);
        // «Up to 5» also counts open invites, which only the server knows.
        startTransition(() => router.refresh());
      } catch {
        setError("Could not remove the manager.");
      }
    });

  const sendLink = () =>
    run("link", async () => {
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
        if (outcome === "copied") setNotice("Link copied");
        setAdding(false);
        setPreset("manager");
        startTransition(() => router.refresh());
      } catch {
        setError("Could not create the link.");
      }
    });

  return (
    <ManageFrame title="Staff" fallbackHref={back} onBack={() => router.replace(back)}>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <Rule className="mt-[18px]" />
      <Zone label="Staff" align={rows.length === 0 ? "baseline" : "start"}>
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
                      <span className="mt-0.5 block t-meta text-[var(--grey)]">
                        {`${staffRole(manager.permissions)} · ${rooms(manager.permissions)}`}
                      </span>
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
                          {running === "remove" ? "Removing…" : "Remove"}
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
            setPreset("manager");
            setError(null);
          }}
          className={`press ${rows.length > 0 ? "mt-2 " : ""}border-0 bg-transparent p-0 t-body text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]`}
        >
          + Add staff
        </button>
        {full ? <p className="mt-1 mb-0 t-meta text-[var(--grey)]">Up to 5 people.</p> : null}
        {adding && !full ? (
          <div className="pt-4">
            <div className="flex flex-col gap-3">
              {PRESETS.map((item) => (
                <label key={item.id} className="flex items-start gap-3">
                  <Checkbox checked={preset === item.id} onCheckedChange={() => setPreset(item.id)} />
                  <span>
                    <span className="block t-body text-[var(--ink)]">{item.label}</span>
                    <span className="mt-0.5 block t-meta text-[var(--grey)]">{rooms(item.permissions())}</span>
                  </span>
                </label>
              ))}
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={preset === "custom"}
                  onCheckedChange={() => {
                    if (preset !== "custom") setCustom(draft);
                    setPreset("custom");
                  }}
                />
                <span>
                  <span className="block t-body text-[var(--ink)]">Custom</span>
                  <span className="mt-0.5 block t-meta text-[var(--grey)]">The rooms you tick.</span>
                </span>
              </label>
              {preset === "custom" ? (
                <PermissionBoxes
                  idPrefix="draft"
                  permissions={custom}
                  disabled={busy}
                  onToggle={(key, checked) => setCustom((current) => ({ ...current, [key]: checked }))}
                />
              ) : null}
            </div>
            <button type="button" disabled={busy} onClick={() => void sendLink()} className={`mt-4 ${SKY}`}>
              {running === "link" ? "Sending…" : "Send link"}
            </button>
          </div>
        ) : null}
        {error ? <p className="mt-3 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
      </Zone>
    </ManageFrame>
  );
}
