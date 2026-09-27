import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationBell } from "@/components/alerts/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { ChevronDown, Heart, LayoutDashboard, LogIn, LogOut, Plane, UserCog, UserRound } from "lucide-react";
import { isGuest } from "@/lib/account";
import { formatMobile } from "@/lib/phone";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

export function Brand() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="پروازیاب — صفحه اصلی">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground sm:size-9">
        <Plane className="size-4.5 sm:size-5" aria-hidden />
      </span>
      <span className="text-lg font-extrabold leading-none sm:text-xl">پروازیاب</span>
    </Link>
  );
}

function AccountMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const displayName = user.agencyName || user.name || "حساب کاربری";

  const handleSignOut = async () => {
    try {
      await signOut(() => navigate("/"));
    } catch {
      toast.error("خروج انجام نشد. دوباره تلاش کنید.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5 px-2.5 sm:px-3" aria-label={`حساب کاربری: ${displayName}`}>
          <UserRound aria-hidden />
          <span className="hidden max-w-32 truncate sm:inline">{displayName}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="truncate font-normal">
          <span className="block truncate font-semibold">{displayName}</span>
          {isGuest(user) ? null : (
            <span className="block truncate text-xs text-muted-foreground" dir="ltr">
              {user.email ?? (user.phone ? formatMobile(user.phone) : null)}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/dashboard">
            <LayoutDashboard aria-hidden />
            داشبورد
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/dashboard/saved">
            <Heart aria-hidden />
            پروازهای ذخیره‌شده
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/dashboard/account">
            <UserCog aria-hidden />
            تنظیمات حساب
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void handleSignOut()}>
          <LogOut aria-hidden />
          خروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  // Come back to the current page after signing in (the landing page defaults to the dashboard).
  const authHref =
    location.pathname === "/" || location.pathname === "/auth"
      ? "/auth"
      : `/auth?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
  // The sign-in pages are where that button leads.
  const onAuthPage = location.pathname.startsWith("/auth");

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
      >
        پرش به محتوای اصلی
      </a>
      <div className="container-page flex h-14 items-center justify-between gap-3 sm:h-16">
        <div className="flex items-center gap-6">
          <Brand />
          <nav className="hidden items-center gap-1 md:flex" aria-label="ناوبری اصلی">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">جستجوی پرواز</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/explore">مقصدهای ارزان</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/agencies">آژانس‌ها</Link>
            </Button>
            {isAuthenticated && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard/saved">ذخیره‌شده‌ها</Link>
              </Button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {isAuthenticated ? <NotificationBell /> : null}
          {isLoading ? (
            <div className="h-9 w-20 animate-pulse rounded-md bg-muted" aria-hidden />
          ) : isAuthenticated ? (
            <AccountMenu />
          ) : onAuthPage ? null : (
            <Button asChild>
              <Link to={authHref}>
                <LogIn aria-hidden />
                <span>
                  ورود<span className="hidden sm:inline"> / ثبت‌نام</span>
                </span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
