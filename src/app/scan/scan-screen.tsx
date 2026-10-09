"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Scan } from "lucide-react";
import { BackButton } from "@/shared/components/back-button";
import { cardLinkFromScan } from "@/shared/lib/card-scan";

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue?: string }[]>;
};

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let left = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let foreignAt = 0;
    let detector = detectorOrNull();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
    };

    const open = (raw: string) => {
      if (left || stopped) return;
      const link = cardLinkFromScan(raw, window.location.origin);
      if (!link) {
        foreignAt = Date.now();
        setHint("Not an ADED card");
        return;
      }
      left = true;
      stop();
      const query = "token" in link ? `token=${encodeURIComponent(link.token)}` : `handle=${encodeURIComponent(link.handle)}`;
      router.push(`/scan/card?${query}`);
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
      if (!raw && context) {
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

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraOff(true);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        void read();
      } catch {
        if (!stopped) setCameraOff(true);
      }
    })();

    return () => stop();
  }, [router]);

  return (
    <main className="fixed inset-0 bg-[var(--ink)]">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Scan className="size-[220px] text-white" strokeWidth={1.25} aria-hidden />
      </div>
      <p className="pointer-events-none absolute inset-x-6 bottom-24 text-center t-meta text-[var(--grey)]">
        {cameraOff ? "Camera is off. Allow it in Settings." : hint}
      </p>
      <BackButton fallbackHref="/main" />
    </main>
  );
}
