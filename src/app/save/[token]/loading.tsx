import { NetworkBand } from "@/app/network/network-band";

export default function SaveLoading() {
  return (
    <main className="compass-main relative flex h-dvh w-full flex-col overflow-hidden bg-white" aria-busy="true">
      <div className="min-h-0 flex-1" />
      <NetworkBand current="network" />
    </main>
  );
}
