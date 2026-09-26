import type { ComponentType } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useSearchParams } from "react-router";
import {
  Ban,
  BellRing,
  Building2,
  ChartColumn,
  Flag,
  Plane,
  ScrollText,
  FileSpreadsheet,
  Heart,
  Info,
  MailWarning,
  ShieldCheck,
  Store,
  UserCog,
} from "lucide-react";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/hooks/use-auth";
import { isGuest } from "@/lib/account";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function navFor(user: User): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: "حساب من",
      items: [
        { to: "/dashboard/saved", label: "پروازهای ذخیره‌شده", icon: Heart },
        { to: "/dashboard/alerts", label: "هشدارهای قیمت", icon: BellRing },
        { to: "/dashboard/account", label: "تنظیمات حساب", icon: UserCog },
      ],
    },
  ];
  if (user.accountRole === "agency") {
    groups.push({
      label: "آژانس",
      items: [
        { to: "/dashboard/agency", label: "پروازهای آژانس", icon: Store },
        { to: "/dashboard/profile", label: "پروفایل و نظرها", icon: Building2 },
        { to: "/dashboard/insights", label: "آمار بازدید", icon: ChartColumn },
        { to: "/dashboard/tools", label: "ورود گروهی و API", icon: FileSpreadsheet },
      ],
    });
  }
  if (user.role === "admin") {
    groups.push({
      label: "مدیریت",
      items: [
        { to: "/dashboard/admin", label: "نمای کلی", icon: ShieldCheck },
        { to: "/dashboard/moderation", label: "بررسی‌ها", icon: Flag },
        { to: "/dashboard/admin/listings", label: "پروازها", icon: Plane },
        { to: "/dashboard/admin/audit", label: "رویدادها", icon: ScrollText },
      ],
    });
  }
  return groups;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors hover:bg-accent",
    isActive ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground",
  );

/** Dashboard frame: greeting, section navigation and the active section. */
export default function DashboardLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return null; // RequireAuth renders this only for signed-in users.
  const groups = navFor(user);
  // The account page shows the same status next to the email; don't say it twice.
  const unverified =
    user.email !== null && !isGuest(user) && user.emailVerifiedAt === null && pathname !== "/dashboard/account";

  return (
    <PageShell className="container-page py-6 sm:py-8">
      <h1 className="text-2xl font-bold">سلام{user.name ? `، ${user.agencyName || user.name}` : ""}</h1>

      {isGuest(user) ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm leading-7">
          <Info className="mt-1.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            با حساب مهمان وارد شده‌اید. پس از خروج، دسترسی به این حساب و پروازهای ذخیره‌شده از بین می‌رود.{" "}
            <Link to="/auth?mode=signup" className="font-medium text-primary underline-offset-4 hover:underline">
              ساخت حساب دائمی
            </Link>
          </span>
        </p>
      ) : null}

      {user.suspendedAt ? (
        <p
          className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm leading-7"
          role="status"
        >
          <Ban className="mt-1.5 size-4 shrink-0 text-destructive" aria-hidden />
          <span>
            حساب شما معلق شده است{user.suspensionReason ? `: ${user.suspensionReason}` : "."} تا رفع تعلیق، انتشار
            پرواز، ثبت نظر و ساختن هشدار ممکن نیست. برای پیگیری به پشتیبانی پیام دهید.
          </span>
        </p>
      ) : null}

      {unverified ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm sm:flex-row sm:items-center">
          <p className="flex flex-1 items-start gap-2 leading-7">
            <MailWarning className="mt-1.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              نشانی{" "}
              <bdi dir="ltr" className="inline-block max-w-full break-all align-top">
                {user.email}
              </bdi>{" "}
              هنوز تأیید نشده است. پیوند تأیید را در ایمیل خود باز کنید تا هشدارهای قیمت برایتان فرستاده شود.
            </span>
          </p>
          <ResendVerificationButton />
        </div>
      ) : null}

      <div className="mt-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <nav aria-label="بخش‌های داشبورد" className="mb-6 lg:sticky lg:top-20 lg:mb-0">
          {/* Phones: one scrolling row. Desktop: grouped sidebar. */}
          <ul className="-mx-1 flex gap-1 overflow-x-auto border-b pb-2 lg:hidden">
            {groups
              .flatMap((g) => g.items)
              .map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end className={linkClass}>
                    <item.icon className="size-4" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
          </ul>
          <div className="hidden space-y-5 lg:block">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">{group.label}</p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <NavLink to={item.to} end className={linkClass}>
                        <item.icon className="size-4" aria-hidden />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </PageShell>
  );
}

/** `/dashboard`: go to the user's main section (and honour old `?tab=` links). */
export function DashboardIndex() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const legacy = params.get("tab");
  const section =
    legacy === "saved" || legacy === "agency" || legacy === "admin"
      ? legacy
      : user?.accountRole === "agency"
        ? "agency"
        : "saved";
  return <Navigate to={`/dashboard/${section}`} replace />;
}
