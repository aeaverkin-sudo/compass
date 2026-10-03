"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Rule } from "@/shared/components/rule";
import { NetworkBand } from "@/app/network/network-band";

type Step = "entry" | "create" | "join";

const ROW =
  "flex min-h-11 w-full items-center justify-center px-2 py-4 text-center t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";
const ENTRY_ROW =
  "flex w-full items-center justify-center px-2 py-3 text-center t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";
const CREATE_FIELDS = ["Name", "Logo", "Description", "Date", "Place"] as const;
const JOIN_OPTIONS = ["Scan QR code", "Enter code", "Open invite link"] as const;

function StickList({
  rows,
  rowClass = ROW,
}: {
  rows: { label: string; onClick?: () => void }[];
  rowClass?: string;
}) {
  return (
    <div>
      {rows.map((row, index) => (
        <div key={row.label}>
          {index > 0 ? <Rule /> : null}
          {row.onClick ? (
            <button type="button" onClick={row.onClick} className={rowClass}>
              {row.label}
            </button>
          ) : (
            <p className={rowClass}>{row.label}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Event door: create or join. The real event flow is a later slice. */
export function EventEntryScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("entry");
  const [stub, setStub] = useState<string | null>(null);

  const openCreate = () => {
    setStub(null);
    setStep("create");
  };

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[#111]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <ScreenHeader
          title={step === "create" ? "Create event" : step === "join" ? "Join" : "Event"}
          fallbackHref="/main"
          onBack={
            step === "entry"
              ? () => router.push("/main")
              : () => {
                  setStub(null);
                  setStep("entry");
                }
          }
        />

        {step === "entry" ? (
          <div className="flex flex-1 items-center">
            <div className="w-full">
              <StickList
                rowClass={ENTRY_ROW}
                rows={[
                  { label: "Join", onClick: () => setStep("join") },
                  { label: "Create", onClick: openCreate },
                ]}
              />
            </div>
          </div>
        ) : null}

        {step === "create" ? (
          <div className="flex flex-1 items-center">
            <div className="w-full">
              <StickList rows={CREATE_FIELDS.map((label) => ({ label }))} />
            </div>
          </div>
        ) : null}

        {step === "join" ? (
          <div className="flex flex-1 items-center">
            <div className="w-full">
              <StickList rows={JOIN_OPTIONS.map((label) => ({ label, onClick: () => setStub(label) }))} />
              {stub ? (
                <p className="mt-8 text-center t-meta text-[var(--grey)]">{stub} — coming soon</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <NetworkBand current="event" />
    </main>
  );
}
