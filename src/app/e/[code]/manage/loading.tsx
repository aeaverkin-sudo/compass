import { NetworkBand } from "@/app/network/network-band";

/** The cabinet frame while its data loads: a tap moves at once instead of waiting on the old screen. */
export default function ManageLoading() {
  return (
    <main className="compass-main relative flex h-dvh w-full flex-col overflow-hidden bg-white" aria-busy="true">
      <div className="min-h-0 flex-1" />
      <NetworkBand current="event" />
    </main>
  );
}
