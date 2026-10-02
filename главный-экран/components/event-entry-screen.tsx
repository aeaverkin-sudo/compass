"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { BackButton } from "@/shared/components/back-button";
import { NetworkTabs } from "@/app/network/network-tabs";
import { cn } from "@/lib/utils";

type Step = "entry" | "create" | "join";

const RUBRIC = "pt-3 text-[11px] leading-[1.45] font-normal tracking-[0.14em] text-hint uppercase";
const ROW =
  "block w-full py-3 text-left text-[34px] leading-none font-normal text-[#111] [-webkit-tap-highlight-color:transparent]";
const CREATE_FIELDS = ["Name", "Logo", "Description", "Date", "Place"] as const;
const JOIN_OPTIONS = ["Scan QR code", "Enter code", "Open invite link"] as const;

function Fork({
  rubric,
  rows,
}: {
  rubric: string;
  rows: { label: string; onClick: () => void }[];
}) {
  return (
    <div className="mt-16 grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4">
      <p className={RUBRIC}>{rubric}</p>
      <div>
        {rows.map((row, index) => (
          <button
            key={row.label}
            type="button"
            onClick={row.onClick}
            className={cn(ROW, index < rows.length - 1 && "border-b-[0.5px] border-[#111]")}
          >
            {row.label}
          </button>
        ))}
      </div>
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
        {step === "entry" ? (
          <button
            type="button"
            aria-label="Create"
            onClick={openCreate}
            className="fixed top-10 right-8 z-30 flex h-[22px] w-11 -translate-y-px items-center justify-end text-[#111] [-webkit-tap-highlight-color:transparent]"
          >
            <Plus className="size-7" strokeWidth={1} aria-hidden />
          </button>
        ) : null}

        {step === "entry" ? (
          <Fork
            rubric="Event"
            rows={[
              { label: "Create", onClick: openCreate },
              { label: "Join", onClick: () => setStep("join") },
            ]}
          />
        ) : null}

        {step === "create" ? (
          <div className="mt-16">
            <h1 className="text-[14px] leading-[1.45] font-normal tracking-[0.1em] text-[#111] uppercase">
              Create event
            </h1>
            <ul className="mt-8">
              {CREATE_FIELDS.map((field) => (
                <li
                  key={field}
                  className="border-b-[0.5px] border-[#111] py-4 text-[15.5px] leading-[1.45] font-normal text-[#999]"
                >
                  {field}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === "join" ? (
          <>
            <Fork
              rubric="Join"
              rows={JOIN_OPTIONS.map((label) => ({ label, onClick: () => setStub(label) }))}
            />
            {stub ? (
              <p className="mt-8 text-[13px] leading-[1.45] font-normal text-[#999]">{stub} — coming soon</p>
            ) : null}
          </>
        ) : null}
      </div>
      <NetworkTabs />
    </main>
  );
}
