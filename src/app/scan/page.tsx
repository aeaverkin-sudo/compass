import type { Metadata } from "next";
import { ScanScreen } from "./scan-screen";

export const metadata: Metadata = { title: "Scan" };

export default function ScanPage() {
  return <ScanScreen />;
}
