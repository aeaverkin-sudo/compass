import type { ContactType } from "@/shared/types";
import { cn } from "@/shared/lib/utils";
import { Globe, Mail, Phone, FileText, StickyNote, Music, Link2, Send } from "lucide-react";

interface ContactIconProps {
  type: ContactType;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const STROKE = 1.85;

type GlyphProps = { size: number; className?: string; style?: React.CSSProperties };

function InstagramIcon({ size, className, style }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      className={className}
      style={style}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedInIcon({ size, className, style }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      className={className}
      style={style}
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 11v5M8 8v.01M12 16v-5c0-1 1-2 2-2s2 1 2 2v5" />
    </svg>
  );
}

export function ContactIcon({ type, size = 15, className, style }: ContactIconProps) {
  const props = {
    size,
    strokeWidth: STROKE,
    className: cn("shrink-0", className),
    style,
  };

  switch (type) {
    case "instagram":
      return <InstagramIcon size={size} className={props.className} style={style} />;
    case "linkedin":
      return <LinkedInIcon size={size} className={props.className} style={style} />;
    case "website":
      return <Globe {...props} />;
    case "email":
      return <Mail {...props} />;
    case "phone":
      return <Phone {...props} />;
    case "pdf":
      return <FileText {...props} />;
    case "telegram":
      return <Send {...props} />;
    case "audio":
      return <Music {...props} />;
    case "text":
      return <StickyNote {...props} />;
    default:
      return <Link2 {...props} />;
  }
}
