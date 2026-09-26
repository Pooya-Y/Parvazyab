import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Header } from "./Header";
import { Footer } from "./Footer";

/**
 * Header + main landmark + footer, shared by every page.
 * `bottomBar` reserves room below the footer for a fixed mobile action bar.
 */
export function PageShell({
  children,
  className,
  bottomBar = false,
}: {
  children: ReactNode;
  className?: string;
  bottomBar?: boolean;
}) {
  return (
    <div className={cn("flex min-h-dvh flex-col", bottomBar && "pb-20 md:pb-0")}>
      <Header />
      <main id="main" tabIndex={-1} className={cn("flex-1 outline-none", className)}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
