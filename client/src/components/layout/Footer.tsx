import { Brand } from "./Header";
import { Link } from "react-router";
import { Download } from "lucide-react";
import { useInstallPrompt } from "@/hooks/use-pwa";
import { jalaliFromKey, todayKey, toFaDigits } from "@/lib/persian";

const LINKS = [
  { to: "/", label: "جستجوی پرواز" },
  { to: "/explore", label: "ارزان‌ترین مقصدها" },
  { to: "/dashboard/saved", label: "پروازهای ذخیره‌شده" },
  { to: "/auth", label: "ورود آژانس‌ها" },
];

export function Footer() {
  const jalaliYear = jalaliFromKey(todayKey())?.jy;
  const { canInstall, install } = useInstallPrompt();

  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="container-page grid gap-8 py-8 sm:grid-cols-[1.5fr_1fr_1fr] sm:py-10">
        <div className="space-y-3">
          <Brand />
          <p className="max-w-xs text-sm leading-7 text-muted-foreground">
            مقایسه قیمت پروازهای داخلی و خارجی از آژانس‌های مختلف، در یک جستجو.
          </p>
          {canInstall ? (
            <button
              type="button"
              onClick={() => void install()}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Download className="size-4" aria-hidden />
              نصب پروازیاب روی این دستگاه
            </button>
          ) : null}
        </div>
        <nav aria-label="پیوندهای پروازیاب">
          <h2 className="mb-3 text-sm font-bold">پروازیاب</h2>
          <ul className="space-y-1 text-sm">
            {LINKS.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="inline-block py-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 text-sm font-bold">پشتیبانی</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>پاسخ‌گویی ۲۴ ساعته</li>
            <li>
              <a href="mailto:support@parvazyab.example" dir="ltr" className="hover:text-foreground">
                support@parvazyab.example
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <p className="container-page py-4 text-center text-xs text-muted-foreground">
          © {jalaliYear ? toFaDigits(jalaliYear) : ""} پروازیاب — تمام حقوق محفوظ است.
        </p>
      </div>
    </footer>
  );
}
