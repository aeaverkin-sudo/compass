import Link from "next/link";
import { BackButton } from "@/shared/components/back-button";
import { Zone } from "@/shared/components/zone";
import { HEADER_ROW_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";

const SKY =
  "inline-block bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]";

/** Door when there is no session. Quick pass uses the existing trial. */
export function EventGate({
  name,
  next,
  inviteHref,
}: {
  name: string;
  next: string;
  inviteHref: string;
}) {
  const signIn = `/register?signin=1&next=${encodeURIComponent(next)}`;
  const signUp = `/register?next=${encodeURIComponent(next)}`;
  const quick = `/try?next=${encodeURIComponent(next)}`;
  const top = `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px)`;

  return (
    <main className="compass-main h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[var(--ink)]">
      <BackButton fallbackHref={inviteHref} />
      <div aria-hidden className="mb-[18px] shrink-0" style={{ height: `calc(${top} + ${HEADER_ROW_PX}px)` }} />
      <div style={{ marginLeft: VALUE_AXIS_PX }}>
        <h1 className="m-0 t-name">You're coming to {name}</h1>
        <p className="mt-3 mb-0 t-body">To join, you'll use your ADED card.</p>
        <p className="mt-2 mb-0 t-meta text-[var(--grey)]">
          Your badge at the door, your card at the event, and your portfolio to keep after.
        </p>
      </div>
      <Zone label="Member" rule align="start">
        <Link href={signIn} className="t-caps text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]">
          Log in
        </Link>
        <p className="mt-1 mb-0 t-meta text-[var(--grey)]">I already use ADED</p>
      </Zone>
      <Zone label="Guest" rule align="start">
        <Link href={signUp} className={SKY}>
          Create your profile
        </Link>
        <p className="mt-3 mb-0 t-meta text-[var(--grey)]">
          Google or email. Share it in real life, keep the people you meet
        </p>
      </Zone>
      <Zone label={<span className="t-label whitespace-normal">Quick pass</span>} align="start">
        <Link href={quick} className="t-caps text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]">
          Quick pass
        </Link>
        <p className="mt-1 mb-0 t-meta text-[var(--grey)]">No sign-up — upgrade to keep it anytime</p>
      </Zone>
    </main>
  );
}
