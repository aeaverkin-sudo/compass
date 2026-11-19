"use client";

import { useEffect, useRef, useState } from "react";
import { Scan } from "lucide-react";
import { BackButton } from "@/shared/components/back-button";
import { parseContactQr, type ScannedContact } from "@/features/contact-collect/scan-qr";

async function openCamera() {
  const tries: MediaStreamConstraints[] = [
    { video: { facingMode: { ideal: "environment" } }, audio: false },
    { video: true, audio: false },
  ];
  let last: unknown = new Error("camera");
  for (const constraints of tries) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

/** The rear camera. A miss stays here so the next code can be tried. An ADED card is not saved. */
export function QrScanner({ onClose, onScan }: { onClose: () => void; onScan: (contact: ScannedContact) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const [attempt, setAttempt] = useState(0);
  const [cameraOff, setCameraOff] = useState(false);
  const [hint, setHint] = useState("Point at a QR");

  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let missed = "";
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

    const read = () => {
      if (stopped) return;
      timer = window.setTimeout(read, 250);
      if (!context || !jsQR || video.readyState < 2 || !video.videoWidth) return;
      const width = Math.min(video.videoWidth, 480);
      const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      const raw = jsQR(frame.data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? "";
      if (stopped || !raw) {
        if (!raw && missed) {
          missed = "";
          setHint("Point at a QR");
        }
        return;
      }
      const found = parseContactQr(raw);
      if (!found) {
        if (missed !== raw) {
          missed = raw;
          setHint("Could not read that. Try again.");
        }
        return;
      }
      stopped = true;
      stopTracks();
      onScanRef.current(found);
    };

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!stopped) setCameraOff(true);
        return;
      }
      try {
        const next = await openCamera();
        if (stopped) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        video.srcObject = stream;
        await video.play();
        if (stopped) {
          stopTracks();
          return;
        }
        setCameraOff(false);
        setHint("Point at a QR");
        read();
      } catch {
        if (!stopped) setCameraOff(true);
      }
    })();

    return () => {
      stopped = true;
      stopTracks();
    };
  }, [attempt]);

  return (
    <div className="fixed inset-0 z-40 bg-[var(--ink)]">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Scan className="size-[220px] text-white" strokeWidth={1.25} aria-hidden />
      </div>
      <div className="absolute inset-x-6 bottom-24 text-center">
        <p className="m-0 t-meta text-[var(--grey)]">
          {cameraOff ? "Camera is off. Allow it in Settings." : hint}
        </p>
        {cameraOff ? (
          <button
            type="button"
            onClick={() => {
              setCameraOff(false);
              setHint("Point at a QR");
              setAttempt((current) => current + 1);
            }}
            className="press mt-4 border-0 bg-transparent t-caps text-white"
          >
            Retry
          </button>
        ) : null}
      </div>
      <BackButton fallbackHref="/network" onBack={onClose} className="text-white" />
    </div>
  );
}
