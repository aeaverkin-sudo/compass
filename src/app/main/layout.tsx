import type { Viewport } from "next";

/** The portfolio status bar matches the white card. Other screens keep the root color. */
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return children;
}
