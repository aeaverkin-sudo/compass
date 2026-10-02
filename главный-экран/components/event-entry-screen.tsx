"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/shared/components/back-button";
import { Rule } from "@/shared/components/rule";
import { NetworkBand } from "@/app/network/network-band";

type Step = "entry" | "create" | "join";

const TITLE =
  "text-center t-caps text-[var(--ink)]";
const ROW =
  "flex min-h-11 w-full items-center justify-center px-2 py-4 text-center t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";
const ENTRY_ROW =
  "flex w-full items-center justify-center px-2 py-3 text-center t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";
const CREATE_FIELDS = ["Name", "Logo", "Description", "Date", "Place"] as const;
const JOIN_OPTIONS = ["Scan QR code", "Enter code", "Open invite link"] as const;

function StickList({
  rows,
  ruleAbove = true,
  rowClass = ROW,
}: {
  rows: { label: string; onClick?: () => void }[];
  ruleAbove?: boolean;
  rowClass?: string;
}) {
  return (
    <div>
      {ruleAbove ? <Rule /> : null}
      {rows.map((row) => (
        <div key={row.label}>
          {row.onClick ? (
            <button type="button" onClick={row.onClick} className={rowClass}>
              {row.label}
            </button>
          ) : (
            <p className={rowClass}>{row.label}</p>
          )}
          <Rule />
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <BackButton
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
        <div className="mt-10 mb-[18px] grid h-[22px] grid-cols-[44px_minmax(0,1fr)_44px] items-center">
          <span aria-hidden className="size-[22px]" />
          <h1 className={TITLE}>
            {step === "create" ? "Create event" : step === "join" ? "Join" : "Event"}
          </h1>
        </div>

        {step === "entry" ? (
          <div className="flex flex-1 items-center">
            <div className="w-full">
              <StickList
                ruleAbove={false}
                rowClass={ENTRY_ROW}
                rows={[
                  { label: "Join", onClick: () => setStep("join") },
                  { label: "Create", onClick: openCreate },
                ]}
              />
            </div>
          </div>
        ) : null}

        {step === "create" ? <StickList rows={CREATE_FIELDS.map((label) => ({ label }))} /> : null}

        {step === "join" ? (
          <>
            <StickList rows={JOIN_OPTIONS.map((label) => ({ label, onClick: () => setStub(label) }))} />
            {stub ? (
              <p className="mt-8 text-center t-meta text-[var(--grey)]">{stub} — coming soon</p>
            ) : null}
          </>
        ) : null}
      </div>
      <NetworkBand current="event" />
    </main>
  );
}
