import type { ReactNode } from "react";
import { Brand } from "@/components/layout/Header";

/** Frame of the standalone auth pages: brand bar and one centred panel. */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-dotted">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="container-page flex h-14 items-center sm:h-16">
          <Brand />
        </div>
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-md rounded-lg border bg-card shadow-sm">
          <div className="border-b px-6 py-5 text-center">
            <h1 className="text-xl font-bold">{title}</h1>
            {description ? <p className="mt-1 text-sm leading-7 text-muted-foreground">{description}</p> : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/** A panel's last row: a way back (to sign-in, the dashboard, …). */
export function AuthFooter({ children }: { children: ReactNode }) {
  return <div className="border-t px-6 py-4 text-center text-sm">{children}</div>;
}
