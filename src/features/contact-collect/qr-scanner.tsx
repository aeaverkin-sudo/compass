"use client";

import { useEffect, useRef, useState } from "react";
import { Scan } from "lucide-react";
import { BackButton } from "@/shared/components/back-button";
import { parseContactQr, type ScannedContact } from "@/features/contact-collect/scan-qr";

/** Long edge for a badge/card still. Keeps the upload under the parse limit. */
const SNAP_MAX_EDGE = 1920;

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

function snapBlob(video: HTMLVideoElement): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return Promise.resolve(null);
  let width = video.videoWidth;
  let height = video.videoHeight;
  const long = Math.max(width, height);
  if (long > SNAP_MAX_EDGE) {
    const scale = SNAP_MAX_EDGE / long;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
  });
}

/**
 * The rear camera. QR stays local on a small frame.
 * An optional snap sends one full frame to the parent — not the contact photo.
 */
export function QrScanner({
  onClose,
  onScan,
  onCapture,
}: {
  onClose: () => void;
  onScan: (contact: ScannedContact) => void;
  /** When set, show Snap. Absent when reading is not available. */
  onCapture?: (blob: Blob) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const onCaptureRef = useRef(onCapture);
  const stopRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [cameraOff, setCameraOff] = useState(false);
  const [hint, setHint] = useState("Point at a QR");
  const [snapping, setSnapping] = useState(false);
  const canSnap = typeof onCapture === "function";

  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    onCaptureRef.current = onCapture;
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
      stopRef.current = null;
    };
    stopRef.current = () => {
      stopped = true;
      busyRef.current = true;
      stopTracks();
    };

    const read = () => {
      if (stopped || busyRef.current) return;
      timer = window.setTimeout(read, 250);
      if (!context || !jsQR || video.readyState < 2 || !video.videoWidth) return;
      const width = Math.min(video.videoWidth, 480);
      const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      const raw = jsQR(frame.data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? "";
      if (stopped || busyRef.current || !raw) {
        if (!raw && missed) {
          missed = "";
          setHint(canSnap ? "Point at a QR or snap a card" : "Point at a QR");
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
      busyRef.current = true;
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
        setHint(canSnap ? "Point at a QR or snap a card" : "Point at a QR");
        busyRef.current = false;
        read();
      } catch {
        if (!stopped) setCameraOff(true);
      }
    })();

    return () => {
      stopped = true;
      busyRef.current = true;
      stopTracks();
    };
  }, [attempt, canSnap]);

  const snap = () => {
    const video = videoRef.current;
    const capture = onCaptureRef.current;
    if (!video || !capture || cameraOff || snapping || busyRef.current) return;
    setSnapping(true);
    busyRef.current = true;
    void (async () => {
      const blob = await snapBlob(video);
      if (!blob) {
        busyRef.current = false;
        setSnapping(false);
        setHint("Could not take that. Try again.");
        return;
      }
      stopRef.current?.();
      capture(blob);
    })();
  };

  return (
    <div className="fixed inset-0 z-40 bg-[var(--ink)]">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Scan className="size-[220px] text-white" strokeWidth={1.25} aria-hidden />
      </div>
      <div className="absolute inset-x-6 bottom-24 text-center">
        <p className="m-0 t-meta text-[var(--grey)]">
          {cameraOff ? "Camera is off. Allow it in Settings." : snapping ? "Reading…" : hint}
        </p>
        {cameraOff ? (
          <button
            type="button"
            onClick={() => {
              setCameraOff(false);
              setHint(canSnap ? "Point at a QR or snap a card" : "Point at a QR");
              setAttempt((current) => current + 1);
            }}
            className="press mt-4 border-0 bg-transparent t-caps text-white"
          >
            Retry
          </button>
        ) : null}
        {canSnap && !cameraOff ? (
          <button
            type="button"
            disabled={snapping}
            onClick={snap}
            className="press mt-4 border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)] disabled:text-[var(--grey)]"
          >
            Snap
          </button>
        ) : null}
      </div>
      <BackButton
        fallbackHref="/network"
        onBack={() => {
          stopRef.current?.();
          onClose();
        }}
        className="text-white"
      />
    </div>
  );
}
