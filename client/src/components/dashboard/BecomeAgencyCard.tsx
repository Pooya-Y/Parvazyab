import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export function BecomeAgencyCard() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError("نام آژانس باید حداقل ۲ حرف باشد.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.dashboard.becomeAgency(name.trim());
      await refresh();
      toast.success("حساب آژانس فعال شد");
      navigate("/dashboard/agency");
    } catch (err) {
      setError(errorMessage(err, "ارتقای حساب ناموفق بود."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-8 rounded-lg border border-dashed p-5 sm:p-6" aria-labelledby="become-agency">
      <h2 id="become-agency" className="flex items-center gap-2 font-semibold">
        <Store className="size-4 text-primary" aria-hidden />
        آژانس مسافرتی دارید؟
      </h2>
      <p className="mt-1 text-sm leading-7 text-muted-foreground">
        نام آژانس را وارد کنید تا حساب شما آژانسی شود و بتوانید پرواز منتشر کنید.
      </p>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Label htmlFor="agency-name" className="sr-only">
          نام آژانس
        </Label>
        <Input
          id="agency-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثلاً آسمان سفر"
          className="h-10 sm:w-64"
          maxLength={60}
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit" disabled={loading} className="h-10">
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          ارتقا به حساب آژانس
        </Button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
