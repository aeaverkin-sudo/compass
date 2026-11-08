import { Suspense } from "react";
import { TryScreen } from "./try-screen";

export default function TryPage() {
  return (
    <Suspense fallback={<div className="h-lvh bg-background" aria-hidden />}>
      <TryScreen />
    </Suspense>
  );
}
