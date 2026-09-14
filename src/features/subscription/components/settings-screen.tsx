"use client";

import Link from "next/link";
import { BarChart3, Crown } from "lucide-react";
import { useAppStore } from "@/shared/store/app-store";
import { TIER_LIMITS } from "@/shared/constants/tiers";
import type { SubscriptionTier } from "@/shared/types";
import { cn } from "@/shared/lib/utils";

const TIERS: SubscriptionTier[] = ["free", "business", "professional", "conference"];

export function SettingsScreen() {
  const user = useAppStore((s) => s.user);
  const setTier = useAppStore((s) => s.setTier);
  const limits = TIER_LIMITS[user.tier];

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-8">
      <h1 className="mb-1 text-2xl font-bold">Settings</h1>
      <p className="mb-6 text-sm text-zinc-500">Привет, {user.name || "User"}</p>

      <div className="mb-6 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        <div className="mb-2 flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-500" />
          <span className="font-medium">Текущий тариф: {limits.label}</span>
        </div>
        <p className="text-sm text-zinc-500">
          До {limits.maxPortfolios} портфолио · до {limits.maxSlots} строк
        </p>
      </div>

      <p className="mb-3 text-sm font-medium">Сменить тариф (demo)</p>
      <div className="mb-6 grid grid-cols-2 gap-2">
        {TIERS.map((tier) => (
          <button
            key={tier}
            onClick={() => setTier(tier)}
            className={cn(
              "rounded-xl p-3 text-left text-sm ring-1 transition",
              user.tier === tier
                ? "bg-indigo-50 ring-indigo-300 dark:bg-indigo-950"
                : "bg-white ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800",
            )}
          >
            <p className="font-medium">{TIER_LIMITS[tier].label}</p>
            <p className="text-[10px] text-zinc-500">
              {TIER_LIMITS[tier].maxPortfolios} portfolios · {TIER_LIMITS[tier].maxSlots} slots
            </p>
          </button>
        ))}
      </div>

      <Link
        href="/analytics"
        className="mb-4 flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
      >
        <BarChart3 className="h-5 w-5 text-indigo-600" />
        <div>
          <p className="font-medium">Analytics</p>
          <p className="text-xs text-zinc-500">Professional / Pro</p>
        </div>
      </Link>

      <div className="rounded-2xl bg-zinc-50 p-4 text-xs text-zinc-500 dark:bg-zinc-900">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">Установка на iPhone</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Откройте сайт в Safari</li>
          <li>Нажмите «Поделиться» (квадрат со стрелкой)</li>
          <li>Выберите «На экран Домой»</li>
        </ol>
      </div>
    </div>
  );
}
