"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Rule } from "@/shared/components/rule";
import { EventForm } from "@/shared/event/event-form";
import { appendEventFields, type EventFormValues } from "@/shared/event/event-form-fields";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { ManageFrame } from "../manage-frame";

export function EditScreen({
  lookup,
  initial,
  logoUrl,
  afishaHref,
}: {
  lookup: string;
  initial: EventFormValues;
  logoUrl: string | null;
  /** The poster snapshot as a PNG; null before the first snapshot. */
  afishaHref: string | null;
}) {
  const router = useRouter();
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const [values, setValues] = useState(initial);
  const [preview, setPreview] = useState(logoUrl);
  const [removed, setRemoved] = useState(false);
  const [logoTouched, setLogoTouched] = useState(false);
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

  const dirty = logoTouched || JSON.stringify(values) !== JSON.stringify(initial);

  return (
    <ManageFrame title="Edit" fallbackHref={back} onBack={() => router.replace(back)}>
      <EventForm
        values={values}
        onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
        logoUrl={preview}
        onLogoFile={(file) => {
          logoFile.current = file;
          setRemoved(false);
          setLogoTouched(true);
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
          setLogoTouched(true);
        }}
      />
      {dirty || saving ? (
        <div className="pointer-events-none sticky bottom-0 z-20 pt-3 pb-3" style={{ marginLeft: VALUE_AXIS_PX }}>
          {error ? <p className="pointer-events-auto mt-0 mb-2 w-max bg-white t-meta text-[var(--ink)]">{error}</p> : null}
          <button
            type="button"
            disabled={!values.name.trim() || saving}
            onClick={() => void save()}
            className="press pointer-events-auto border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
          >
            Save changes
          </button>
        </div>
      ) : null}
      {afishaHref ? (
        <div className="pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          <Rule />
          <a
            href={afishaHref}
            download
            className="press mt-[18px] flex items-center gap-2 t-body text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
            style={{ marginLeft: VALUE_AXIS_PX }}
          >
            <Download size={16} strokeWidth={1.25} className="shrink-0 text-[var(--ink)]" />
            Afisha as image
          </a>
        </div>
      ) : null}
    </ManageFrame>
  );
}
