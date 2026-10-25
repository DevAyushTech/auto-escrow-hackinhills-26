import "./globals.css";
import { FlowProvider } from "@/context/FlowContext";
import { ThemeProvider } from "next-themes";
import { GlobalCookieBanner } from "@/components/ui/GlobalCookieBanner";

export const metadata = {
  title: "AutoEscrow",
  description: "Trust Infrastructure",
};

// --- OPTIMIZED INSTANT BACKGROUND (Zero Layout Thrashing) ---
function AmbientBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden will-change-transform">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] opacity-60 dark:opacity-40" />
      <div className="absolute top-[-10%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-[radial-gradient(circle_at_center,rgba(76,29,149,0.12)_0%,transparent_70%)]" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.12)_0%,transparent_70%)]" />
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-zinc-50 dark:bg-[#07090E] text-zinc-900 dark:text-slate-100 antialiased font-sans transition-colors duration-200">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <FlowProvider>
            <AmbientBackground />
            {children}
            <GlobalCookieBanner />
          </FlowProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}