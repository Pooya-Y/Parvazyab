import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AirportPicker } from "@/components/flights/AirportPicker";
import { JalaliDatePicker } from "@/components/flights/JalaliDatePicker";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, safeExternalUrl } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import {
  addDaysToKey,
  epochToDateKey,
  epochToTimeInput,
  formatDuration,
  formatPrice,
  formatStops,
  tehranDateTimeToEpoch,
  toEnDigits,
  todayKey,
} from "@/lib/persian";
import { invalidate } from "@/lib/use-api-query";
import type { Cabin, Listing } from "@/lib/types";

/** Create/edit an agency flight listing. Times are entered in Tehran time. */
export function ListingForm({ listing, onSuccess }: { listing?: Listing; onSuccess: () => void }) {
  const ids = useId();
  const [origin, setOrigin] = useState(listing?.originCode ?? "THR");
  const [destination, setDestination] = useState(listing?.destinationCode ?? "MHD");
  const [airline, setAirline] = useState(listing?.airline ?? "");
  const [flightNo, setFlightNo] = useState(listing?.flightNo ?? "");
  const [departDate, setDepartDate] = useState<string | null>(
    listing ? epochToDateKey(listing.departAt) : addDaysToKey(todayKey(), 1),
  );
  const [departTime, setDepartTime] = useState(listing ? epochToTimeInput(listing.departAt) : "08:00");
  const [durationMin, setDurationMin] = useState(String(listing?.durationMin ?? 90));
  const [stops, setStops] = useState(listing?.stops ?? 0);
  const [cabin, setCabin] = useState<Cabin>(listing?.cabin ?? "economy");
  const [price, setPrice] = useState(listing ? String(listing.priceToman) : "");
  const [bookingUrl, setBookingUrl] = useState(listing?.bookingUrl ?? "https://");
  const [isActive, setIsActive] = useState(listing?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceValue = Number(toEnDigits(price).replace(/[,٬\s]/g, ""));
  const durationValue = Number(toEnDigits(durationMin));

  const validate = (): string | null => {
    if (origin === destination) return "مبدا و مقصد نمی‌توانند یکسان باشند.";
    if (!airline.trim()) return "نام ایرلاین را وارد کنید.";
    if (!flightNo.trim()) return "شماره پرواز را وارد کنید.";
    if (!departDate || tehranDateTimeToEpoch(departDate, departTime) === null)
      return "تاریخ و ساعت حرکت را کامل وارد کنید.";
    if (!Number.isInteger(durationValue) || durationValue < 20 || durationValue > 1440)
      return "مدت پرواز باید بین ۲۰ تا ۱۴۴۰ دقیقه باشد.";
    if (!Number.isFinite(priceValue) || priceValue <= 0) return "قیمت معتبر وارد کنید.";
    if (!safeExternalUrl(bookingUrl.trim())) return "لینک رزرو باید با https:// یا http:// شروع شود.";
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const departAt = tehranDateTimeToEpoch(departDate!, departTime)!;
      await api.dashboard.upsertListing({
        id: listing?.id,
        originCode: origin,
        destinationCode: destination,
        airline: airline.trim(),
        flightNo: flightNo.trim(),
        departAt,
        arriveAt: departAt + durationValue * 60_000,
        stops,
        cabin,
        priceToman: priceValue,
        bookingUrl: bookingUrl.trim(),
        isActive,
      });
      invalidate("listings");
      toast.success(listing ? "تغییرات پرواز ذخیره شد" : "پرواز منتشر شد");
      onSuccess();
    } catch (err) {
      setError(errorMessage(err, "ذخیره پرواز ناموفق بود."));
    } finally {
      setSaving(false);
    }
  };

  const field = (suffix: string) => `${ids}-${suffix}`;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <AirportPicker label="مبدا" value={origin} onChange={setOrigin} />
        <AirportPicker label="مقصد" value={destination} onChange={setDestination} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={field("airline")}>ایرلاین</Label>
          <Input
            id={field("airline")}
            value={airline}
            onChange={(e) => setAirline(e.target.value)}
            placeholder="مثلاً ماهان ایر"
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={field("flightno")}>شماره پرواز</Label>
          <Input
            id={field("flightno")}
            value={flightNo}
            onChange={(e) => setFlightNo(e.target.value)}
            placeholder="W5-101"
            dir="ltr"
            maxLength={16}
            autoCapitalize="characters"
            required
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <JalaliDatePicker label="تاریخ حرکت" value={departDate} onChange={setDepartDate} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={field("time")}>ساعت حرکت</Label>
            <Input
              id={field("time")}
              type="time"
              dir="ltr"
              value={departTime}
              onChange={(e) => setDepartTime(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={field("duration")}>مدت (دقیقه)</Label>
            <Input
              id={field("duration")}
              inputMode="numeric"
              dir="ltr"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              aria-describedby={field("duration-hint")}
              required
            />
          </div>
        </div>
      </div>
      <p id={field("duration-hint")} className="-mt-2 text-xs text-muted-foreground">
        {durationValue > 0
          ? `مدت پرواز: ${formatDuration(durationValue)} · ساعت‌ها به وقت ایران`
          : "ساعت‌ها به وقت ایران"}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={field("stops")}>تعداد توقف</Label>
          <Select value={String(stops)} onValueChange={(v) => setStops(Number(v))}>
            <SelectTrigger id={field("stops")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {formatStops(n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={field("cabin")}>کلاس پرواز</Label>
          <Select value={cabin} onValueChange={(v) => setCabin(v as Cabin)}>
            <SelectTrigger id={field("cabin")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="economy">اکونومی</SelectItem>
              <SelectItem value="business">بیزینس</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={field("price")}>قیمت (تومان)</Label>
        <Input
          id={field("price")}
          inputMode="numeric"
          dir="ltr"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="2450000"
          aria-describedby={field("price-hint")}
          required
        />
        <p id={field("price-hint")} className="text-xs text-muted-foreground">
          {priceValue > 0 ? formatPrice(priceValue) : "قیمت هر بلیط به تومان"}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={field("url")}>لینک رزرو در سایت آژانس</Label>
        <Input
          id={field("url")}
          type="url"
          dir="ltr"
          value={bookingUrl}
          onChange={(e) => setBookingUrl(e.target.value)}
          placeholder="https://agency.example/booking"
          required
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
        <Label htmlFor={field("active")} className="font-normal">
          نمایش در نتایج جستجو
        </Label>
        <Switch id={field("active")} checked={isActive} onCheckedChange={setIsActive} />
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="submit" disabled={saving} className="h-10 w-full sm:w-auto">
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {listing ? "ذخیره تغییرات" : "انتشار پرواز"}
        </Button>
      </DialogFooter>
    </form>
  );
}
