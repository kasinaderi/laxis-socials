import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Socialix — AI-Powered Social Media Multi-Agent Team",
  description: "Autonomous multi-agent social media agency with Locoagent browser automation, E2B sandboxes, and virtual office.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 antialiased font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
