import { SignedOutGate } from "@/shared/components/signed-out-gate";

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return <SignedOutGate>{children}</SignedOutGate>;
}
