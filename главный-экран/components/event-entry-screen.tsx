"use client";

import { useState, type ReactNode } from "react";
import { BackButton } from "@/shared/components/back-button";
import { NetworkTabs } from "@/app/network/network-tabs";
import { cn } from "@/lib/utils";

type Step = "entry" | "create" | "join";

/** Same axis as a card zone: 86px rubric, 14px gap, 15.5px lines, rule across the row. */
const CARD_INSET = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";
const RUBRIC =
  "text-[11px] leading-[1.45] font-normal tracking-[0.1em] whitespace-nowrap text-[#999] uppercase";
const VALUE =
  "block w-full text-left text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111] [-webkit-tap-highlight-color:transparent]";
const CREATE_FIELDS = ["Name", "Logo", "Description", "Date", "Place"] as const;
const JOIN_OPTIONS = ["Scan QR code", "Enter code", "Open invite link"] as const;

function Zone({
  rubric,
  rule = true,
  children,
}: {
  rubric: string;
  rule?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 py-[18px]", rule && "border-b-[0.5px] border-[#111]")}>
      <div className="grid grid-cols-[86px_minmax(0,1fr)] items-baseline gap-x-[14px]">
        <span className={RUBRIC}>{rubric}</span>
        <div className="flex min-w-0 flex-col gap-[6px]">{children}</div>
      </div>
    </section>
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
      <div className={cn("min-h-0 flex-1 overflow-y-auto pb-[max(2.5rem,env(safe-area-inset-bottom))]", CARD_INSET)}>
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
          <Zone rubric="Event">
            <button type="button" onClick={() => setStep("join")} className={VALUE}>
              Join
            </button>
            <button type="button" onClick={openCreate} className={VALUE}>
              Create
            </button>
          </Zone>
        ) : null}

        {step === "create"
          ? CREATE_FIELDS.map((field) => (
              <Zone key={field} rubric={field}>
                <span className="block text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] text-[#999]">
                  &nbsp;
                </span>
              </Zone>
            ))
          : null}

        {step === "join" ? (
          <>
            <Zone rubric="Join">
              {JOIN_OPTIONS.map((label) => (
                <button key={label} type="button" onClick={() => setStub(label)} className={VALUE}>
                  {label}
                </button>
              ))}
            </Zone>
            {stub ? (
              <p className="text-[13px] leading-[1.45] font-normal tracking-[-0.015em] text-[#999]">
                {stub} — coming soon
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      <NetworkTabs />
    </main>
  );
}
