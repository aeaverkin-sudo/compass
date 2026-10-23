"use client";

import { useEffect, useState } from "react";

type Snap = { label: string; text: string };

function readLog(): Snap[] {
  if (typeof window === "undefined") return [];
  const log = (window as Window & { __compassViewportLog?: Snap[] }).__compassViewportLog;
  return log ? log.slice() : [];
}

function innerOf(snap: Snap | undefined) {
  const line = snap?.text.split("\n").find((row) => row.startsWith("inner "));
  const match = line?.match(/inner (\S+)/);
  return match?.[1] ?? "—";
}

/** Temporary. Reads the head-script viewport log. It does not change the page size. */
export function ViewportDebug() {
  const [log, setLog] = useState<Snap[]>([]);

  useEffect(() => {
    const pull = () => setLog(readLog());
    pull();
    window.addEventListener("compass-viewport-snap", pull);
    return () => window.removeEventListener("compass-viewport-snap", pull);
  }, []);

  const cold = innerOf(log.find((snap) => snap.label === "A"));
  const back = innerOf(log.find((snap) => snap.label === "E"));

  return (
    <pre className="t-meta pointer-events-auto fixed top-0 left-0 z-[80] m-0 max-h-[46svh] w-full overflow-auto bg-white p-2 whitespace-pre-wrap text-[var(--ink)]">
      {`A inner ${cold} → E inner ${back}\n`}
      {log.map((snap) => snap.text).join("\n\n")}
    </pre>
  );
}
