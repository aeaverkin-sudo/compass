"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EventForm } from "@/shared/event/event-form";
import { appendEventFields, type EventFormValues } from "@/shared/event/event-form-fields";
import { ManageFrame } from "../manage-frame";

export function EditScreen({
  lookup,
  initial,
  logoUrl,
}: {
  lookup: string;
  initial: EventFormValues;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const [values, setValues] = useState(initial);
  const [preview, setPreview] = useState(logoUrl);
  const [removed, setRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoFile = useRef<File | null>(null);
  const savingLock = useRef(false);

  const save = async () => {
    if (!values.name.trim() || savingLock.current) return;
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
    </ManageFrame>
  );
}
