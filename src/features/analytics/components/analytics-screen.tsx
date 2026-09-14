"use client";

import { BarChart3, Eye, ExternalLink, FileText, Camera } from "lucide-react";
import { MOCK_ANALYTICS } from "@/shared/constants/mock-data";

export function AnalyticsScreen() {
  const data = MOCK_ANALYTICS[0];

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-8">
      <h1 className="mb-1 text-2xl font-bold">Analytics</h1>
      <p className="mb-2 text-sm text-zinc-500">Professional / Pro — анонимная статистика</p>

      <div className="mb-6 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700 dark:bg-indigo-950">
        Demo data. Просмотры всегда анонимны — нельзя увидеть, кто именно открыл материалы.
      </div>

      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-indigo-600" />
        <span className="font-medium">{data.portfolioName}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Eye} label="Portfolio opened" value={data.opened} />
        <StatCard icon={ExternalLink} label="Links opened" value={data.linksOpened} />
        <StatCard icon={FileText} label="Pitch deck" value={data.pitchDeck} />
        <StatCard icon={ExternalLink} label="Website" value={data.website} />
        <StatCard icon={Camera} label="Instagram" value={data.instagram} />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <Icon className="mb-2 h-4 w-4 text-indigo-500" />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
