"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Scan } from "lucide-react";
import { BackButton } from "@/shared/components/back-button";
import { cardLinkFromScan } from "@/shared/lib/card-scan";

const FLASH_MS = 800;

const SCAN_LINE = {
  new: "Added",
  existing: "Already in your network",
  own: "This is your card",
} as const;

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue?: string }[]>;
};

function openRearCamera() {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { exact: "environment" } },
    audio: false,
  });
}

function detectorOrNull(): Detector | null {
  const ctor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector })
    .BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

export function ScanScreen() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hint, setHint] = useState("Point at a QR");
  const [cameraOff, setCameraOff] = useState(false);
  const [flash, setFlash] = useState<{ name: string; line: string } | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let left = false;
    let holding = false;
    let starting = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let foreignAt = 0;
    let detector = detectorOrNull();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let jsQR: (typeof import("jsqr"))["default"] | null = null;
    void import("jsqr").then((module) => {
      jsQR = module.default;
    });

    const stopTracks = () => {
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
    };

    const stop = () => {
      stopped = true;
      stopTracks();
    };

    const open = (raw: string) => {
      if (left || stopped || holding) return;
      const link = cardLinkFromScan(raw, window.location.origin);
      if (!link) {
        foreignAt = Date.now();
        setHint("Not an ADED card");
        return;
      }
      holding = true;
      stopTracks();
      void (async () => {
        try {
          const response = await fetch("/api/scan/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(link),
          });
          if (stopped) return;
          if (response.status === 401) {
            router.replace("token" in link ? `/c/${encodeURIComponent(link.token)}` : `/@${encodeURIComponent(link.handle)}`);
            return;
          }
          if (!response.ok) {
            holding = false;
            foreignAt = Date.now();
            setHint("Not an ADED card");
            void start();
            return;
          }
          const body = (await response.json()) as { outcome?: keyof typeof SCAN_LINE; name?: string };
          const outcome = body.outcome && body.outcome in SCAN_LINE ? body.outcome : null;
          if (!outcome) {
            holding = false;
            void start();
            return;
          }
          left = true;
          stop();
          setFlash({ name: body.name?.trim() || "Untitled", line: SCAN_LINE[outcome] });
          window.setTimeout(() => {
            if (outcome === "own") {
              setFlash(null);
              left = false;
              holding = false;
              stopped = false;
              void start();
              return;
            }
            router.push("/network");
          }, FLASH_MS);
        } catch {
          if (stopped) return;
          holding = false;
          setHint("Not an ADED card");
          void start();
        }
      })();
    };

    const read = async () => {
      if (stopped) return;
      timer = window.setTimeout(() => void read(), 100);
      if (video.readyState < 2 || !video.videoWidth) return;
      let raw = "";
      if (detector) {
        try {
          const codes = await detector.detect(video);
          raw = codes.find((code) => code.rawValue)?.rawValue ?? "";
        } catch {
          detector = null;
        }
      }
      if (!raw && context && jsQR) {
        const width = Math.min(video.videoWidth, 480);
        const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
        canvas.width = width;
        canvas.height = height;
        context.drawImage(video, 0, 0, width, height);
        const frame = context.getImageData(0, 0, width, height);
        raw = jsQR(frame.data, width, height, { inversionAttempts: "dontInvert" })?.data ?? "";
      }
      if (stopped) return;
      if (raw) {
        open(raw);
        return;
      }
      if (foreignAt && Date.now() - foreignAt > 1200) {
        foreignAt = 0;
        setHint("Point at a QR");
      }
    };

    const pageHidden = () => document.visibilityState === "hidden";

    const start = async () => {
      if (stopped || left || holding || starting || stream) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraOff(true);
        return;
      }
      starting = true;
      let hiddenAfterOpen = false;
      try {
        const next = await openRearCamera();
        if (stopped || left || pageHidden()) {
          next.getTracks().forEach((track) => track.stop());
          hiddenAfterOpen = !stopped && !left && pageHidden();
          return;
        }
        stream = next;
        video.srcObject = stream;
        await video.play();
        if (stopped || left || pageHidden()) {
          stopTracks();
          hiddenAfterOpen = !stopped && !left && pageHidden();
          return;
        }
        setCameraOff(false);
        void read();
      } catch {
        if (!stopped) setCameraOff(true);
      } finally {
        starting = false;
        if (hiddenAfterOpen && !pageHidden() && !stream && !stopped && !left) {
          void start();
        }
      }
    };

    const onVisibility = () => {
      if (pageHidden()) {
        stopTracks();
        return;
      }
      void start();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void start();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [router]);

  return (
    <main className="fixed inset-0 bg-[var(--ink)]">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
      {flash ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-8">
          <div className="flex max-w-[280px] flex-col items-center bg-white px-5 py-4 text-center">
            <Check className="size-8 text-[var(--sky)]" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 mb-0 t-body text-[var(--ink)]">{flash.name}</p>
            <p className="mt-1 mb-0 t-meta text-[var(--grey)]">{flash.line}</p>
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Scan className="size-[220px] text-white" strokeWidth={1.25} aria-hidden />
      </div>
      <p className="pointer-events-none absolute inset-x-6 bottom-24 text-center t-meta text-[var(--grey)]">
        {cameraOff ? "Camera is off. Allow it in Settings." : hint}
      </p>
      <BackButton fallbackHref="/main" className="text-white" />
    </main>
  );
}
