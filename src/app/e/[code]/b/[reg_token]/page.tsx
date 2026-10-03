import type { Metadata } from "next";
import { ScreenHeader } from "@/shared/components/screen-header";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { openEventBadge } from "@/shared/services/event-registration";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string; reg_token: string }> };

export const metadata: Metadata = { title: "Check-in" };

function formatCheckedInAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} · ${time}`;
}

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function EventBadgePage({ params }: PageProps) {
  const { code, reg_token } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const viewerId = data.user && !data.user.is_anonymous ? data.user.id : null;
  const opened = await openEventBadge(lookup, reg_token, viewerId);

  if (opened.kind === "missing") {
    return (
      <main className="compass-main fixed inset-0 overflow-y-auto bg-white">
        <ScreenHeader title="Check-in" fallbackHref="/network/event" />
        <div className="px-[var(--gutter)]">
          <p className="mb-0 t-body text-[var(--grey)]">Event badge not found</p>
        </div>
      </main>
    );
  }

  if (opened.kind === "badge") {
    return (
      <main className="compass-main fixed inset-0 overflow-y-auto bg-white">
        <ScreenHeader title="Badge" fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
        <div className="px-[var(--gutter)]">
          <p className="mb-0 t-body text-[var(--ink)]">{opened.name} — event badge</p>
        </div>
      </main>
    );
  }

  const when = opened.already ? formatCheckedInAt(opened.at) : "";
  return (
    <main className="compass-main fixed inset-0 overflow-y-auto bg-white">
      <ScreenHeader title="Check-in" fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
      <div className="px-[var(--gutter)]">
        <p className="mb-0 t-body text-[var(--ink)]">Checked in: {opened.name}</p>
        {when ? <p className="mt-2 mb-0 t-meta text-[var(--grey)]">{when}</p> : null}
      </div>
    </main>
  );
}
