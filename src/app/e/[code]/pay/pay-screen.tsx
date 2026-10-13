"use client";

import { useRouter } from "next/navigation";
import { Zone } from "@/shared/components/zone";
import { eventTitleLine } from "@/shared/event/event-title";
import type { EventPay } from "@/shared/event/payment-label";
import type { EventRegistration } from "@/shared/services/event-registration";
import { PaymentBlock } from "../join/event-join";
import { ManageFrame } from "../manage/manage-frame";

export function PayScreen({
  lookup,
  eventName,
  pay,
  registration,
}: {
  lookup: string;
  eventName: string;
  pay: EventPay;
  registration: EventRegistration;
}) {
  const router = useRouter();
  return (
    <ManageFrame title={eventTitleLine(eventName)} fallbackHref="/main" onBack={() => router.replace("/main")}>
      <div className="pt-[18px]">
        <Zone label="Payment" align="start">
          <PaymentBlock lookup={lookup} pay={pay} registration={registration} onSaid={() => router.replace("/main")} />
          <p className="mt-4 mb-0 t-meta text-[var(--grey)]">
            Your pass opens right after. The organiser confirms the payment later.
          </p>
        </Zone>
      </div>
    </ManageFrame>
  );
}
