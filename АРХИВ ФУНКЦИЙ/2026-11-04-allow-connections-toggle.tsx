/**
 * Profile switch "Allow connections", removed from Sharing on 4 Nov 2026.
 * The account still stores sharing_connections and copies it onto each
 * registration as consent_connections. Nothing reads it for matching.
 * Not imported by the app. Paste the block back under Share anonymous analytics.
 */

import { Switch } from "@/shared/components/ui/switch";

type Sharing = { analytics: boolean; connections: boolean };

export function AllowConnectionsSwitch({
  sharing,
  save,
}: {
  sharing: Sharing;
  save: (next: Sharing) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch
        checked={sharing.connections}
        onCheckedChange={(checked) => save({ ...sharing, connections: checked === true })}
        aria-labelledby="profile-sharing-connections"
        className="mt-[2px] shrink-0"
      />
      <span className="min-w-0">
        <span id="profile-sharing-connections" className="block t-body text-[var(--ink)]">
          Allow connections
        </span>
        <span className="mt-1 block t-meta text-[var(--grey)]">
          Your summary can be matched to the right people — say, an investor you&apos;re looking for.
        </span>
      </span>
    </div>
  );
}
