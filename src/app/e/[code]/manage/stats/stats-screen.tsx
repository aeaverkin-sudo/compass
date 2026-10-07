"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Zone } from "@/shared/components/zone";
import { formatEventRange } from "@/shared/event/when";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { snapshotToPdf } from "@/shared/services/card-pdf-file";
import { isHomeScreenApp } from "@/shared/services/save-public-card-pdf";
import type { EventStats } from "@/shared/services/event-manage";
import { ManageFrame } from "../manage-frame";

const FIGURE = "text-[32px] leading-none font-normal tracking-[-0.03em] text-[var(--ink)] tabular-nums";

function clock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

function statsFilename(name: string) {
  const slug = name
    .replace(/\n/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]+/g, "")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "event"}-stats.pdf`;
}

function handPdf(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const file = new File([copy], filename, { type: "application/pdf" });
  if (isHomeScreenApp()) {
    window.dispatchEvent(new CustomEvent("compass-pdf-preview", { detail: { blob: file, name: filename } }));
    return;
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function WaveChart({ bins, startAt, endAt }: { bins: number[]; startAt: string; endAt: string }) {
  const max = Math.max(...bins, 1);
  const peak = Math.max(...bins);
  return (
    <div className="mt-3">
      <div className="relative h-24 overflow-hidden" aria-hidden>
        {bins.map((count, index) => (
          <div
            key={index}
            className="absolute bottom-0"
            style={{
              left: bins.length === 1 ? 0 : `${(index / (bins.length - 1)) * 100}%`,
              width: 2,
              height: count === 0 ? 0 : Math.max(2, (count / max) * 96),
              background: count > 0 && count === peak ? "var(--sky)" : "#e0e0e0",
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-3 t-meta text-[var(--grey)]">
        <span>{clock(startAt)}</span>
        <span>{clock(endAt)}</span>
      </div>
    </div>
  );
}

export function StatsScreen({
  lookup,
  name,
  date,
  endsAt,
  isPaid,
  stats,
}: {
  lookup: string;
  name: string;
  date: string | null;
  endsAt: string | null;
  isPaid: boolean;
  stats: EventStats;
}) {
  const router = useRouter();
  const sheet = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const when = formatEventRange(date, endsAt);
  const eventLine = when ? `${name} · ${when}` : name;
  const arrival = `${Math.round(stats.arrivalRate * 100)}% of registered`;
  const wave = stats.wave;

  const exportPdf = async () => {
    const node = sheet.current;
    if (!node || busy) return;
    setBusy(true);
    setError(null);
    try {
      handPdf(await snapshotToPdf(node), statsFilename(name));
    } catch {
      setError("Could not export the PDF.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ManageFrame title="Statistics" fallbackHref={back} onBack={() => router.push(back)} centered>
      <div ref={sheet}>
        <Zone label="Event" rule>
          <p className="t-body break-words text-[var(--ink)]">{eventLine}</p>
        </Zone>
        <Zone label="Registered" rule>
          <p className={FIGURE}>{stats.registered}</p>
        </Zone>
        {isPaid ? (
          <Zone label="Confirmed" rule>
            <p className={FIGURE}>{stats.confirmed}</p>
            <p className="mt-1 mb-0 flex items-center gap-2 t-meta text-[var(--grey)]">
              <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full bg-[var(--pay-confirmed)]" />
              {`of ${stats.registered} · ${stats.notConfirmed} not confirmed`}
            </p>
          </Zone>
        ) : null}
        <Zone label="Checked in" rule>
          <p className={FIGURE}>{stats.checkedIn}</p>
          <p className="mt-1 mb-0 t-meta text-[var(--grey)]">{arrival}</p>
        </Zone>
        <Zone label="Wave" rule>
          {wave && wave.peakCount > 0 ? (
            <>
              <p className="t-body text-[var(--ink)]">{`Busiest ${clock(wave.peakAt)} · ${wave.peakCount} in over 10 min`}</p>
              <WaveChart bins={wave.bins} startAt={wave.startAt} endAt={wave.endAt} />
            </>
          ) : (
            <p className="t-meta text-[var(--grey)]">No check-ins yet</p>
          )}
        </Zone>
        <Zone label="Exchanged" rule>
          <p className="t-body text-[var(--ink)]">—</p>
          <p className="mt-1 mb-0 t-meta text-[var(--grey)]">Coming soon</p>
        </Zone>
        <Zone label="Summary">
          <p className="t-body text-[var(--ink)]">—</p>
          <p className="mt-1 mb-0 t-meta text-[var(--grey)]">Anonymous segment of guests who opted in. Coming soon.</p>
        </Zone>
      </div>
      <div className="mt-[18px]" style={{ marginLeft: VALUE_AXIS_PX }}>
        <button
          type="button"
          onClick={() => void exportPdf()}
          disabled={busy}
          className="press inline-flex items-center gap-2 border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
        >
          <Download size={15} strokeWidth={1.5} aria-hidden />
          Export PDF
        </button>
        {error ? <p className="mt-2 mb-0 t-meta text-[var(--grey)]">{error}</p> : null}
      </div>
    </ManageFrame>
  );
}
