import { Brand } from "./Header";
import { Link } from "react-router";
import { jalaliFromKey, todayKey, toFaDigits } from "@/lib/persian";

const LINKS = [
  { to: "/", label: "جستجوی پرواز" },
  { to: "/dashboard?tab=saved", label: "پروازهای ذخیره‌شده" },
  { to: "/auth", label: "ورود آژانس‌ها" },
];

export function Footer() {
  const jalaliYear = jalaliFromKey(todayKey())?.jy;

  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="container-page grid gap-8 py-8 sm:grid-cols-[1.5fr_1fr_1fr] sm:py-10">
        <div className="space-y-3">
          <Brand />
          <p className="max-w-xs text-sm leading-7 text-muted-foreground">
            مقایسه قیمت پروازهای داخلی و خارجی از آژانس‌های مختلف، در یک جستجو.
          </p>
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
