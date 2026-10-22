"use client";

import { useEffect, useState } from "react";

type Row = { label: string; value: string };

function probe(cssHeight: string) {
  const node = document.createElement("div");
  node.style.cssText = `position:fixed;top:0;height:${cssHeight};visibility:hidden;pointer-events:none`;
  document.documentElement.appendChild(node);
  const height = node.getBoundingClientRect().height;
  node.remove();
  return height;
}

function px(value: number) {
  return String(Math.round(value * 10) / 10);
}

function read(): Row[] {
  const root = getComputedStyle(document.documentElement);
  const css = (name: string) => root.getPropertyValue(name).trim() || "—";
  const vv = window.visualViewport?.height;
  return [
    { label: "100svh", value: px(probe("100svh")) },
    { label: "100lvh", value: px(probe("100lvh")) },
    { label: "100dvh", value: px(probe("100dvh")) },
    { label: "innerHeight", value: String(window.innerHeight) },
    { label: "visualViewport.height", value: vv == null ? "—" : px(vv) },
    { label: "--app-h", value: css("--app-h") },
    { label: "--band-h", value: css("--band-h") },
    { label: "--vv-bottom", value: css("--vv-bottom") },
    { label: "safe-area-inset-bottom", value: px(probe("env(safe-area-inset-bottom)")) },
  ];
}

/** Temporary. Numbers only, so the cold-start height can be read on the phone. */
export function ViewportDebug() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const tick = () => setRows(read());
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] bg-white px-3 pb-1 pt-[max(env(safe-area-inset-top),8px)] t-meta text-[var(--ink)]">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3">
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
