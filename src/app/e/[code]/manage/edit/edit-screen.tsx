"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Rule } from "@/shared/components/rule";
import { EventForm } from "@/shared/event/event-form";
import { appendEventFields, type EventFormValues } from "@/shared/event/event-form-fields";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { ManageFrame } from "../manage-frame";

const SKY =
  "press mt-4 border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

export function EditScreen({
  lookup,
  initial,
  logoUrl,
  isOwner,
}: {
  lookup: string;
  initial: EventFormValues;
  logoUrl: string | null;
  isOwner: boolean;
}) {
  const router = useRouter();
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const [values, setValues] = useState(initial);
  const [preview, setPreview] = useState(logoUrl);
  const [removed, setRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const logoFile = useRef<File | null>(null);
  const savingLock = useRef(false);
  const deletingLock = useRef(false);

  const save = async () => {
    if (!values.name.trim() || savingLock.current || deletingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      appendEventFields(body, values, logoFile.current, removed && !logoFile.current);
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}`, { method: "PATCH", body });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save the event.");
        savingLock.current = false;
        setSaving(false);
        return;
      }
      router.replace(`${back}?saved=1`);
    } catch {
      setError("Could not save the event.");
      savingLock.current = false;
      setSaving(false);
    }
  };

  const deleteName = values.name.trim() || initial.name.trim();

  const remove = async () => {
    if (!isOwner || deletingLock.current || savingLock.current) return;
    deletingLock.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setDeleteError(payload.error ?? "Could not delete the event.");
        deletingLock.current = false;
        setDeleting(false);
        return;
      }
      router.replace("/network/event");
    } catch {
      setDeleteError("Could not delete the event.");
      deletingLock.current = false;
      setDeleting(false);
    }
  };

  return (
    <ManageFrame title="Edit" fallbackHref={back} onBack={() => router.replace(back)}>
      <EventForm
        values={values}
        onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
        logoUrl={preview}
        onLogoFile={(file) => {
          logoFile.current = file;
          setRemoved(false);
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") setPreview(reader.result);
          };
          reader.readAsDataURL(file);
        }}
        onRemoveLogo={() => {
          logoFile.current = null;
          setPreview(null);
          setRemoved(true);
        }}
        submitLabel="Save"
        hint=""
        saving={saving}
        error={error}
        onSubmit={() => void save()}
      />
      {isOwner ? (
        <div className="pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          <Rule />
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="press mt-[18px] border-0 bg-transparent p-0 t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
            style={{ marginLeft: VALUE_AXIS_PX }}
          >
            Delete event
          </button>
          {confirmDelete ? (
            <div style={{ marginLeft: VALUE_AXIS_PX }}>
              <p className="mt-2 mb-0 t-meta text-[var(--grey)]">
                This deletes the event and everything in it — guests, co-hosts, invites. This can&apos;t be undone.
              </p>
              <button type="button" disabled={deleting} onClick={() => void remove()} className={SKY}>
                Delete {deleteName}
              </button>
              {deleteError ? <p className="mt-2 mb-0 t-meta text-[var(--ink)]">{deleteError}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </ManageFrame>
  );
}
