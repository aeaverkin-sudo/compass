import { SignedOutGate } from "@/shared/components/signed-out-gate";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <SignedOutGate>{children}</SignedOutGate>;
}
