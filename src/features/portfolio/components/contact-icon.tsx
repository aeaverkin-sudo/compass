import type { ContactType } from "@/shared/types";
import { cn } from "@/shared/lib/utils";
import { Globe, Mail, Phone, FileText, Link2 } from "lucide-react";

interface ContactIconProps {
  type: ContactType;
  size?: number;
  className?: string;
}

function InstagramIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedInIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 11v5M8 8v.01M12 16v-5c0-1 1-2 2-2s2 1 2 2v5" />
    </svg>
  );
}

export function ContactIcon({ type, size = 16, className }: ContactIconProps) {
  const props = { size, className: cn("shrink-0", className) };

  switch (type) {
    case "instagram":
      return <InstagramIcon size={size} className={props.className} />;
    case "linkedin":
      return <LinkedInIcon size={size} className={props.className} />;
    case "website":
      return <Globe {...props} strokeWidth={1.5} />;
    case "email":
      return <Mail {...props} strokeWidth={1.5} />;
    case "phone":
      return <Phone {...props} strokeWidth={1.5} />;
    case "pdf":
      return <FileText {...props} strokeWidth={1.5} />;
    default:
      return <Link2 {...props} strokeWidth={1.5} />;
  }
}
