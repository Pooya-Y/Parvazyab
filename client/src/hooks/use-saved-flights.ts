import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { useApiQuery } from "@/lib/use-api-query";
import type { Flight } from "@/lib/types";
import { useAuth } from "./use-auth";

/** The signed-in user's saved flights plus a save/unsave toggle for flight cards. */
export function useSavedFlights() {
  const { user } = useAuth();
  const query = useApiQuery(user ? `saved:${user.id}` : null, (signal) => api.saved.list(signal), ["saved"]);
  const { data, setData } = query;
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const savedKeys = useMemo(() => new Set(data?.map((s) => s.flightKey)), [data]);

  const toggle = useCallback(
    async (flight: Flight) => {
      const wasSaved = savedKeys.has(flight.id);
      setPending((p) => new Set(p).add(flight.id));
      try {
        if (wasSaved) {
          await api.saved.remove(flight.id);
          setData((list) => list?.filter((s) => s.flightKey !== flight.id));
          toast.success("از ذخیره‌شده‌ها حذف شد");
        } else {
          const row = await api.saved.save(flight);
          setData((list) => [row, ...(list ?? []).filter((s) => s.flightKey !== row.flightKey)]);
          toast.success("پرواز ذخیره شد", { description: "از داشبورد به آن دسترسی دارید." });
        }
      } catch (err) {
        toast.error(errorMessage(err, wasSaved ? "حذف انجام نشد. دوباره تلاش کنید." : "ذخیره نشد. دوباره تلاش کنید."));
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(flight.id);
          return next;
        });
      }
    },
    [savedKeys, setData],
  );

  return { ...query, savedKeys, pending, toggle };
}
