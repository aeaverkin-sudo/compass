"use client";

import { useState } from "react";
import { BackButton } from "@/shared/components/back-button";
import { NetworkTabs } from "@/app/network/network-tabs";

type Step = "entry" | "create" | "join";

/** Same stick as Sign up: 1.5px, #c9c9c9, the full width of the px-8 column. */
const RULE = "border-t-[1.5px] border-[#c9c9c9]";
const ROW =
  "flex min-h-11 w-full items-center justify-center px-2 py-4 text-center text-[15px] leading-[1.3] font-normal tracking-[0.14em] text-[#111] uppercase [-webkit-tap-highlight-color:transparent]";
const CREATE_FIELDS = ["Name", "Logo", "Description", "Date", "Place"] as const;
const JOIN_OPTIONS = ["Scan QR code", "Enter code", "Open invite link"] as const;

function StickList({
  rows,
}: {
  rows: { label: string; onClick?: () => void }[];
}) {
  return (
    <div>
      <div className={RULE} />
      {rows.map((row) => (
        <div key={row.label}>
          {row.onClick ? (
            <button type="button" onClick={row.onClick} className={ROW}>
              {row.label}
            </button>
          ) : (
            <p className={ROW}>{row.label}</p>
          )}
          <div className={RULE} />
        </div>
      ))}
    </div>
  );
}

/** Event door: create or join. The real event flow is a later slice. */
export function EventEntryScreen() {
  const [step, setStep] = useState<Step>("entry");
  const [stub, setStub] = useState<string | null>(null);

  const openCreate = () => {
    setStub(null);
    setStep("create");
  };

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[#111]">
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <BackButton
          fallbackHref="/network"
          onBack={
            step === "entry"
              ? undefined
              : () => {
                  setStub(null);
                  setStep("entry");
                }
          }
        />
        <div className="mt-10 mb-[18px] grid h-[22px] grid-cols-[44px_minmax(0,1fr)_44px] items-center">
          <span aria-hidden className="size-[22px]" />
          <h1 className="text-center text-[14px] leading-[1.45] font-normal tracking-[0.1em] text-[#111] uppercase">
            {step === "create" ? "Create event" : step === "join" ? "Join" : "Event"}
          </h1>
        </div>

        {step === "entry" ? (
          <StickList
            rows={[
              { label: "Join", onClick: () => setStep("join") },
              { label: "Create", onClick: openCreate },
            ]}
          />
        ) : null}

        {step === "create" ? <StickList rows={CREATE_FIELDS.map((label) => ({ label }))} /> : null}

        {step === "join" ? (
          <>
            <StickList rows={JOIN_OPTIONS.map((label) => ({ label, onClick: () => setStub(label) }))} />
            {stub ? (
              <p className="mt-8 text-center text-[13px] leading-[1.45] font-normal text-[#999]">{stub} — coming soon</p>
            ) : null}
          </>
        ) : null}
      </div>
      <NetworkTabs />
    </main>
  );
}
