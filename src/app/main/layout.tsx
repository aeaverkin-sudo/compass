import type { Viewport } from "next";

/** The portfolio status bar is sky. Other screens keep the root color. */
export const viewport: Viewport = {
  themeColor: "#c5e8f7",
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return children;
}
