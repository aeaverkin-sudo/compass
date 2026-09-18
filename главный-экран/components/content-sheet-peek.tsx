"use client";

export function ContentSheetPeek() {
  return (
    <section
      aria-label="Поле для наполнения визитки"
      className="compass-sheet-peek mx-5 flex h-full min-h-0 flex-col overflow-hidden rounded-t-[18px] px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto mb-2 h-[3px] w-8 shrink-0 rounded-full bg-hairline/35" aria-hidden />
      <p className="shrink-0 text-center text-[13px] leading-[1.25] text-hint">
        link, email, phone, file…
      </p>
      <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-[12px] border border-hairline/25 bg-background/40" />
    </section>
  );
}
