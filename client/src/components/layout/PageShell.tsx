import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Header } from "./Header";
import { Footer } from "./Footer";

/**
 * Header + main landmark + footer, shared by every page.
 * `bottomBar` reserves room below the footer for a fixed action bar: `true` for a
 * mobile-only bar, `"always"` for one shown at every width.
 */
export function PageShell({
  children,
  className,
  bottomBar = false,
}: {
  children: ReactNode;
  className?: string;
  bottomBar?: boolean | "always";
}) {
  return (
    <div className={cn("flex min-h-dvh flex-col", bottomBar === "always" ? "pb-20" : bottomBar && "pb-20 md:pb-0")}>
      <Header />
      <main id="main" tabIndex={-1} className={cn("flex-1 outline-none", className)}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
