"use client";

import { useEffect, useRef, useState } from "react";
import type { CardSnapshot } from "@/shared/types";
import { cardPdfFilename, generateCardPdf } from "@/shared/services/card-pdf";

type SharePdfPageProps = {
  token: string;
  pdfMode: boolean;
};

async function downloadPdf(snapshot: CardSnapshot) {
  const bytes = await generateCardPdf(snapshot);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = cardPdfFilename(snapshot);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function SharePdfPage({ token, pdfMode }: SharePdfPageProps) {
  const [snapshot, setSnapshot] = useState<CardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const autoDownloaded = useRef(false);

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.snapshot) setSnapshot(data.snapshot);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!pdfMode || !snapshot || autoDownloaded.current) return;

    autoDownloaded.current = true;
    setSaving(true);
    void downloadPdf(snapshot).finally(() => setSaving(false));
  }, [pdfMode, snapshot]);

  if (loading) {
    return <div className="flex h-lvh items-center justify-center bg-background" aria-busy />;
  }

  if (!snapshot) {
    return (
      <div className="flex h-lvh flex-col items-center justify-center bg-background px-8 text-center">
        <p className="text-[15px] text-hint">Визитка не найдена</p>
      </div>
    );
  }

  const nextScanSelfie = snapshot.nextScanAddons?.find((addon) => addon.type === "selfie");
  const nextScanNotes = snapshot.nextScanAddons?.filter((addon) => addon.type !== "selfie") ?? [];

  return (
    <div className="flex h-lvh flex-col items-center justify-center bg-background px-8 text-center">
      <p className="text-[22px] text-foreground">{snapshot.displayName}</p>
      {snapshot.title ? <p className="mt-2 text-[14px] text-hint">{snapshot.title}</p> : null}

      {nextScanSelfie ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-hint">Selfie</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={nextScanSelfie.content}
            alt=""
            className="size-[120px] rounded-[18px] border border-hairline object-cover"
          />
        </div>
      ) : null}

      {nextScanNotes.length > 0 ? (
        <ul className="mt-6 w-full max-w-sm space-y-2 text-left">
          {nextScanNotes.map((addon) => (
            <li key={addon.id} className="rounded-[12px] border border-hairline/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-hint">
                {addon.type === "voice" ? "Voice note" : "Note"}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-foreground">{addon.content}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => void downloadPdf(snapshot)}
        className="mt-8 min-w-[200px] border border-hairline px-8 py-3 text-[13px] tracking-[0.18em] uppercase"
      >
        {saving ? "Preparing…" : "Save to Files (PDF)"}
      </button>
    </div>
  );
}
