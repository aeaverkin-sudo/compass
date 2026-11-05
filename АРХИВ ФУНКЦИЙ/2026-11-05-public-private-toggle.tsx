/**
 * Profile → Portfolios switch Public / Private, removed on 5 Nov 2026.
 * It wrote cards.listed. Nothing that shows a card read that column.
 * writeCardListed in card-sync.ts is still there. Not imported by the app.
 * Paste the block back under the wallet line in each portfolio row,
 * and restore setCardListed plus isSolePublic in the store.
 */

import { Switch } from "@/shared/components/ui/switch";

export function PublicPrivateToggle({
  isPublic,
  locked,
  ready,
  onChange,
}: {
  isPublic: boolean;
  locked: boolean;
  ready: boolean;
  onChange: (listed: boolean) => void;
}) {
  return (
    <>
      <div className="mt-2 flex items-center gap-3">
        <span className="t-label">{isPublic ? "Public" : "Private"}</span>
        <Switch
          checked={isPublic}
          disabled={!ready || locked}
          onCheckedChange={(checked) => onChange(checked === true)}
          aria-label={isPublic ? "Public" : "Private"}
          className="disabled:opacity-100"
        />
      </div>
      {ready ? (
        <>
          {locked ? (
            <p className="mt-2 t-meta text-[var(--ink)]">
              Your main portfolio is always public — it&apos;s how people find you.
            </p>
          ) : null}
          <p className="mt-2 t-meta text-[var(--ink)]">
            {isPublic
              ? "Public — people you've connected with can see this portfolio behind your others, and find it in search."
              : "Private — reachable only by its direct link or QR. Kept off your profile and out of search."}
          </p>
        </>
      ) : null}
    </>
  );
}
