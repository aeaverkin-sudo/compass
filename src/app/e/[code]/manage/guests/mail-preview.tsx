"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { MAIL_WIDTH } from "./mail-width";

export function MailPreview({ html }: { html: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const outer = frame.current;
    const inner = sheet.current;
    if (!outer || !inner) return;
    const measure = () => {
      const scale = Math.min(1, outer.clientWidth / MAIL_WIDTH);
      const height = Math.ceil(inner.offsetHeight * scale);
      setFit((current) => (current && current.scale === scale && current.height === height ? current : { scale, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [html]);

  return (
    <div ref={frame} aria-label="The mail your guests get" className="w-full max-w-full overflow-hidden" style={{ height: fit?.height }}>
      <div
        ref={sheet}
        className="pointer-events-none origin-top-left select-none bg-white"
        style={{ width: MAIL_WIDTH, transform: `scale(${fit?.scale ?? 1})`, opacity: fit ? 1 : 0 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
