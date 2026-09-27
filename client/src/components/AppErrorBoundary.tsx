import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Last-resort boundary: a render crash shows a Persian message instead of a blank page. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Unhandled render error", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-sm text-center" role="alert">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-muted">
            <AlertTriangle className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <h1 className="mt-4 text-lg font-bold">مشکلی در نمایش صفحه پیش آمد</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            صفحه را دوباره بارگذاری کنید. اگر مشکل ادامه داشت، کمی بعد دوباره سر بزنید.
          </p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            <RotateCcw />
            بارگذاری دوباره
          </Button>
        </div>
      </main>
    );
  }
}
