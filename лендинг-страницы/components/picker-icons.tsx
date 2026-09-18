import { cn } from "@/lib/utils";

const SF = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.65,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      {...SF}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-[20.4px] shrink-0 text-hairline", className)}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** SF Symbol–style: camera */
export function IconCamera({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M8.5 7.5h1.2l.9-1.8h2.8l.9 1.8H16a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="12.5" r="2.8" />
    </IconFrame>
  );
}

/** SF Symbol–style: photo.on.rectangle.angled */
export function IconPhotoLibrary({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M4.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 18V12a1.5 1.5 0 0 1 1.5-1.5z" />
      <path d="M8.5 5.5h11a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5" />
      <circle cx="10.5" cy="10" r="0.9" />
      <path d="M7.5 15.5l2.3-2.3 1.8 1.8 2.2-2.2 2.7 2.9" />
    </IconFrame>
  );
}

/** SF Symbol–style: folder */
export function IconFolder({ className }: { className?: string }) {
  return (
    <IconFrame className={className}>
      <path d="M4.5 8.2V18a1.8 1.8 0 0 0 1.8 1.8h11.4A1.8 1.8 0 0 0 19.5 18V10.2a1.8 1.8 0 0 0-1.8-1.8h-6.3L10 6.2H6.3A1.8 1.8 0 0 0 4.5 8.2z" />
    </IconFrame>
  );
}
