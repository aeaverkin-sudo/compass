"use client";

import { useEffect, useState } from "react";
import { probeViewport } from "@main/layout";

function useGeoFlag() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).get("geo") === "1");
  }, []);
  return on;
}

/** Overlay of band geometry. Only when `?geo=1`. */
export function BandGeo({ page }: { page: "/c" | "/main" }) {
  const on = useGeoFlag();
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!on) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setLines(readBandGeo(page));
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("resize", schedule);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, [on, page]);

  if (!on) return null;

  return (
    <div className="fixed top-0 left-0 z-[100] bg-white/90 p-2 font-mono text-[11px] leading-[1.3] text-[#111]">
      {lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}

function probeUnit(unit: "svh" | "lvh" | "dvh") {
  if (unit === "svh" || unit === "lvh") return probeViewport(unit);
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;height:100dvh;visibility:hidden;pointer-events:none";
  document.documentElement.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height || window.innerHeight;
}

function readBandGeo(page: "/c" | "/main") {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  const shells = document.querySelectorAll(".compass-main");
  const shell = document.querySelector("main.compass-main, div.compass-main");
  const nav =
    page === "/c"
      ? document.querySelector('nav[aria-label="Account"]')
      : document.querySelector("nav.compass-sky-band");
  const door = nav?.querySelector("a, button") ?? null;
  const text = door?.querySelector("span") ?? door;
  const safe = readSafeArea();
  return [
    `page: ${page}   ua: ${navigator.userAgent.slice(0, 60)}`,
    `innerH ${Math.round(window.innerHeight)}  vvH ${num(viewport?.height)}  vvTop ${num(viewport?.offsetTop)}`,
    `svh ${Math.round(probeUnit("svh"))}  lvh ${Math.round(probeUnit("lvh"))}  dvh ${Math.round(probeUnit("dvh"))}  scrollH ${Math.round(root.scrollHeight)}`,
    `safeBottom ${safe.bottom}  safeTop ${safe.top}`,
    `--app-h ${cssPx(root, "--app-h")}  --band-h ${cssPx(root, "--band-h")}  --vv-bottom ${cssPx(root, "--vv-bottom")}`,
    `shells ${shells.length}  shell: ${box(shell)}`,
    `nav: ${box(nav)}`,
    `text: ${edges(text)}`,
  ];
}

function readSafeArea() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.documentElement.appendChild(probe);
  const style = getComputedStyle(probe);
  const top = Math.round(Number.parseFloat(style.paddingTop) || 0);
  const bottom = Math.round(Number.parseFloat(style.paddingBottom) || 0);
  probe.remove();
  return { top, bottom };
}

function cssPx(root: HTMLElement, name: string) {
  const fromStyle = Number.parseFloat(root.style.getPropertyValue(name));
  if (Number.isFinite(fromStyle)) return String(Math.round(fromStyle));
  const fromComputed = Number.parseFloat(getComputedStyle(root).getPropertyValue(name));
  return Number.isFinite(fromComputed) ? String(Math.round(fromComputed)) : "—";
}

function num(value: number | undefined) {
  return value == null ? "—" : String(Math.round(value));
}

function box(node: Element | null) {
  if (!node) return "—";
  const rect = node.getBoundingClientRect();
  return `top ${Math.round(rect.top)} bottom ${Math.round(rect.bottom)} h ${Math.round(rect.height)}`;
}

function edges(node: Element | null) {
  if (!node) return "—";
  const rect = node.getBoundingClientRect();
  return `top ${Math.round(rect.top)} bottom ${Math.round(rect.bottom)}`;
}
