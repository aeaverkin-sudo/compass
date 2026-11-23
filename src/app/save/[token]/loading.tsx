import { MainTabs } from "@main/components/main-tabs";

export default function SaveLoading() {
  return (
    <main className="compass-main flex h-dvh w-full flex-col overflow-hidden bg-white" aria-busy="true">
      <div className="min-h-0 flex-1" />
      <MainTabs current="network" />
    </main>
  );
}
