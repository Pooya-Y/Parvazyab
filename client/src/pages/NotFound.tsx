import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { PlaneTakeoff } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  useDocumentTitle("صفحه پیدا نشد");
  return (
    <PageShell className="flex items-center justify-center px-4 py-16">
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PlaneTakeoff className="size-7" aria-hidden />
        </div>
        <p className="mt-4 text-4xl font-extrabold">۴۰۴</p>
        <h1 className="mt-2 text-lg font-semibold">صفحه پیدا نشد</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-7 text-muted-foreground">
          صفحه‌ای که دنبالش بودید وجود ندارد یا جابه‌جا شده است.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild>
            <Link to="/">جستجوی پرواز</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard">داشبورد</Link>
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
