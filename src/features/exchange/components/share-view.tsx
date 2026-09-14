"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SharedPortfolioView } from "@/features/portfolio/components/shared-portfolio-view";
import { downloadPortfolioPdf } from "@/features/portfolio/services/portfolio-pdf";
import { useAppStore } from "@/shared/store/app-store";
import type { PortfolioSnapshot } from "@/shared/types";

interface ShareViewProps {
  token: string;
  printMode?: boolean;
  pdfMode?: boolean;
}

export function ShareView({ token, printMode, pdfMode }: ShareViewProps) {
  const router = useRouter();
  const addPerson = useAppStore((s) => s.addPerson);
  const user = useAppStore((s) => s.user);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [privateSave, setPrivateSave] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.portfolio) {
          setSnapshot(data.portfolio);
          setOwnerName(data.ownerName || "");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (printMode) setTimeout(() => window.print(), 500);
  }, [printMode, snapshot]);

  const handlePdfSave = async () => {
    if (!snapshot) return;
    setPdfLoading(true);
    try {
      await downloadPortfolioPdf(snapshot);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSave = () => {
    if (!snapshot) return;
    const fullName = [snapshot.firstName, snapshot.lastName].filter(Boolean).join(" ");
    addPerson({
      direction: "received",
      name: fullName || ownerName || "Unknown",
      headline: snapshot.name,
      description: snapshot.description,
      photo: snapshot.photo,
      selfiePhoto: undefined,
      showSelfie: false,
      slots: snapshot.slots,
      context: {
        date: new Date().toISOString(),
        location: "Shared remotely",
      },
      notes: [],
      privateSave,
      savedByName: privateSave ? undefined : user.name,
      positiveOutcome: "none",
    });
    setSaved(true);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f7]">
        <div className="h-6 w-6 animate-spin border border-[#1a1a1a] border-t-transparent" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f7] p-6 text-center">
        <p className="mb-4 text-[14px] text-[#666]">Portfolio not found</p>
        <button type="button" onClick={() => router.push("/")} className="text-[13px] underline">
          Home
        </button>
      </div>
    );
  }

  const fullName = [snapshot.firstName, snapshot.lastName].filter(Boolean).join(" ");

  return (
    <div className={`mx-auto max-w-lg bg-[#faf9f7] ${printMode ? "print:p-0" : "py-8"}`}>
      {!printMode && (
        <p className="mb-4 text-center text-[12px] text-[#888]">
          {fullName || ownerName || "Shared portfolio"}
        </p>
      )}

      <SharedPortfolioView snapshot={snapshot} />

      {!printMode && pdfMode && (
        <div className="mt-6 space-y-3 px-6">
          <p className="text-center text-[12px] text-[#888]">
            Save this portfolio to your device
          </p>
          <button
            type="button"
            onClick={handlePdfSave}
            disabled={pdfLoading}
            className="w-full border border-[#1a1a1a] py-3.5 text-[13px] tracking-wide uppercase"
          >
            {pdfLoading ? "Preparing…" : "Save to Files (PDF)"}
          </button>
          {user.onboarded && !saved && (
            <>
              <div className="my-2 border-t border-[#e8e8e8]" />
              <label className="flex items-center gap-2 text-[13px] text-[#666]">
                <input
                  type="checkbox"
                  checked={privateSave}
                  onChange={(e) => setPrivateSave(e.target.checked)}
                />
                Private Save
              </label>
              <button
                type="button"
                onClick={handleSave}
                className="w-full border border-[#ccc] py-2.5 text-[12px] tracking-wide uppercase text-[#666]"
              >
                Save in Compass
              </button>
            </>
          )}
        </div>
      )}

      {!printMode && !pdfMode && !saved && user.onboarded && (
        <div className="mt-6 space-y-4 px-6">
          <button
            type="button"
            onClick={handlePdfSave}
            disabled={pdfLoading}
            className="w-full border border-[#1a1a1a] py-3 text-[13px] tracking-wide uppercase"
          >
            {pdfLoading ? "Preparing…" : "Save to Files (PDF)"}
          </button>
          <label className="flex items-center gap-2 text-[13px] text-[#666]">
            <input
              type="checkbox"
              checked={privateSave}
              onChange={(e) => setPrivateSave(e.target.checked)}
            />
            Private Save
          </label>
          <button
            type="button"
            onClick={handleSave}
            className="w-full border border-[#ccc] py-2.5 text-[12px] tracking-wide uppercase"
          >
            Save in Compass
          </button>
        </div>
      )}

      {saved && (
        <div className="mt-6 px-6 text-center text-[13px] text-[#666]">
          Saved — open People → Received
          <button
            type="button"
            className="mt-3 block w-full border border-[#ccc] py-2 text-[12px]"
            onClick={() => router.push("/people")}
          >
            Open People
          </button>
        </div>
      )}

      {!user.onboarded && !printMode && (
        <div className="mt-6 space-y-3 px-6 text-center">
          {!pdfMode && (
            <button
              type="button"
              onClick={handlePdfSave}
              disabled={pdfLoading}
              className="block w-full border border-[#1a1a1a] py-3 text-[13px] tracking-wide uppercase"
            >
              {pdfLoading ? "Preparing…" : "Save to Files (PDF)"}
            </button>
          )}
          <button type="button" onClick={() => router.push("/onboarding")} className="text-[13px] underline">
            Get started with Compass
          </button>
        </div>
      )}
    </div>
  );
}
