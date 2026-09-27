import type { ReactNode } from "react";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/use-pwa";
import { cn } from "@/lib/utils";
import { Header } from "./Header";
import { Footer } from "./Footer";

/** Says why nothing loads, instead of letting requests fail one by one. */
function OfflineNotice() {
  const online = useOnline();
  if (online) return null;
  return (
    <p
      className="flex items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-center text-sm text-muted-foreground"
      role="status"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      اتصال اینترنت قطع است؛ قیمت‌ها و نتایج تا وصل شدن دوباره به‌روز نمی‌شوند.
    </p>
  );
}

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
      <OfflineNotice />
      <main id="main" tabIndex={-1} className={cn("flex-1 outline-none", className)}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
