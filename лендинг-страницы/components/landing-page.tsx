import { AvatarPicker } from "./avatar-picker";
import { NameFields } from "./name-fields";

export function LandingPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-8">
      <div className="flex w-full max-w-xs flex-col items-center">
        <AvatarPicker />
        <div className="mt-[1.5cm] w-full">
          <NameFields />
        </div>
      </div>
    </main>
  );
}
