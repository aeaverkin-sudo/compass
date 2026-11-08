import { SignedOutGate } from "@/shared/components/signed-out-gate";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <SignedOutGate>{children}</SignedOutGate>;
}
