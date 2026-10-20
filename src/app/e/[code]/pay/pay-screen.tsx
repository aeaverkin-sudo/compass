"use client";

import { useRouter } from "next/navigation";
import { TapButton } from "@/shared/components/tap-button";
import { Zone } from "@/shared/components/zone";
import { eventTitleLine } from "@/shared/event/event-title";
import type { EventPay } from "@/shared/event/payment-label";
import type { EventRegistration } from "@/shared/services/event-registration";
import { PaymentBlock } from "../join/event-join";
import { ManageFrame } from "../manage/manage-frame";

const SKY =
  "press inline-block border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";

export function PayScreen({
  lookup,
  eventName,
  pay,
  registration,
  next = null,
}: {
  lookup: string;
  eventName: string;
  pay: EventPay;
  registration: EventRegistration | null;
  /** Empty portfolio: payment, then the questionnaire. */
  next?: string | null;
}) {
  const router = useRouter();
  const onward = next ?? "/main";
  return (
    <ManageFrame title={eventTitleLine(eventName)} fallbackHref="/main" onBack={() => router.replace("/main")}>
      <div className="pt-[18px]">
        <Zone label="Payment" align="start">
          <PaymentBlock lookup={lookup} pay={pay} registration={registration} onSaid={() => router.replace(onward)} />
          {next && !registration ? (
            <TapButton onTap={() => router.replace(next)} className={`mt-4 ${SKY}`}>
              Continue
            </TapButton>
          ) : null}
          <p className="mt-4 mb-0 t-meta text-[var(--grey)]">
            {next
              ? "Your portfolio is next. The organiser confirms the payment later."
              : "Your pass opens right after. The organiser confirms the payment later."}
          </p>
        </Zone>
      </div>
    </ManageFrame>
  );
}
