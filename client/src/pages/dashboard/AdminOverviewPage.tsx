import { useState } from "react";
import { toast } from "sonner";
import { Building2, Plane, Store, Users } from "lucide-react";
import { LoadError, RouteLabel, StatBox } from "@/components/dashboard/common";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { isGuest } from "@/lib/account";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatPrice, toFaDigits } from "@/lib/persian";
import type { User } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";

const ROLE_LABEL = { admin: "مدیر", agency: "آژانس", user: "کاربر" } as const;

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? "";
  useDocumentTitle("مدیریت");
  const stats = useApiQuery("admin-stats", (signal) => api.admin.stats(signal));
  const users = useApiQuery("admin-users", (signal) => api.admin.users(signal));
  const [savingId, setSavingId] = useState<string | null>(null);

  const changeRole = async (u: User, role: "user" | "agency") => {
    setSavingId(u.id);
    try {
      await api.admin.setRole(u.id, role);
      users.setData((list) => list?.map((x) => (x.id === u.id ? { ...x, role, accountRole: role } : x)));
      stats.refetch();
      toast.success("نقش کاربر تغییر کرد");
    } catch (err) {
      toast.error(errorMessage(err, "تغییر نقش ناموفق بود."));
    } finally {
      setSavingId(null);
    }
  };

  if ((stats.error && !stats.data) || (users.error && !users.data)) {
    return (
      <LoadError
        error={stats.error ?? users.error}
        onRetry={() => {
          stats.refetch();
          users.refetch();
        }}
      />
    );
  }
  if (!stats.data || !users.data) {
    return (
      <div className="space-y-3" aria-hidden>
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  const s = stats.data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox icon={Plane} label="کل پروازها" value={toFaDigits(s.listingsTotal)} />
        <StatBox icon={Store} label="پروازهای فعال" value={toFaDigits(s.listingsActive)} />
        <StatBox icon={Users} label="کاربران" value={toFaDigits(s.usersTotal)} />
        <StatBox icon={Building2} label="آژانس‌ها" value={toFaDigits(s.agencies)} />
      </div>

      {s.topRoutes.length > 0 ? (
        <section aria-labelledby="top-routes">
          <h2 id="top-routes" className="mb-2 font-bold">
            مسیرهای پرپرواز
          </h2>
          <ul className="divide-y rounded-lg border bg-card">
            {s.topRoutes.map((r) => {
              const [from, to] = r.route.split("-");
              return (
                <li key={r.route} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="font-medium">
                    <RouteLabel from={from} to={to} />
                  </span>
                  <span className="text-muted-foreground">
                    {toFaDigits(r.count)} پرواز · از {formatPrice(r.minPrice)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="users-heading">
        <h2 id="users-heading" className="mb-2 font-bold">
          کاربران
        </h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 text-start font-medium">
                  کاربر
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  نقش
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.data.map((u) => {
                const locked = u.role === "admin" || u.id === currentUserId;
                return (
                  <tr key={u.id}>
                    <td className="p-3">
                      <div className="font-medium">{u.agencyName || u.name}</div>
                      <div dir="ltr" className="text-start text-xs text-muted-foreground">
                        {isGuest(u) ? "guest" : u.email}
                      </div>
                    </td>
                    <td className="p-3">
                      {locked ? (
                        <span className="rounded-md bg-muted px-2.5 py-1 text-xs">{ROLE_LABEL[u.role]}</span>
                      ) : (
                        <Select
                          value={u.accountRole}
                          disabled={savingId === u.id}
                          onValueChange={(v) => void changeRole(u, v as "user" | "agency")}
                        >
                          <SelectTrigger size="sm" className="w-28" aria-label={`نقش ${u.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">کاربر</SelectItem>
                            <SelectItem value="agency">آژانس</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
