"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zone } from "@/shared/components/zone";

const ROW =
  "press block border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] no-underline disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";
const SKY =
  "press mt-3 border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

export function EditZone({
  lookup,
  deleteName,
  canDelete,
}: {
  lookup: string;
  deleteName: string;
  /** Deleting stays with the owner, as on the edit screen. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  const remove = async () => {
    if (lock.current) return;
    lock.current = true;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not delete the event.");
      router.replace("/network/event");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete the event.");
      lock.current = false;
      setDeleting(false);
    }
  };

  return (
    <Zone label="Edit" align="start">
      <div className="flex flex-col gap-3">
        <Link href={`/e/${encodeURIComponent(lookup)}/manage/edit`} className={ROW}>
          Change details
        </Link>
        {canDelete ? (
          <div>
            <button type="button" onClick={() => setConfirm((value) => !value)} className={ROW}>
              Delete event
            </button>
            {confirm ? (
              <>
                <p className="mt-2 mb-0 t-meta text-[var(--grey)]">
                  This deletes the event and everything in it — guests, co-hosts, invites. This can&apos;t be undone.
                </p>
                <button type="button" disabled={deleting} onClick={() => void remove()} className={SKY}>
                  {`Delete ${deleteName}`}
                </button>
                {error ? <p className="mt-2 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </Zone>
  );
}
