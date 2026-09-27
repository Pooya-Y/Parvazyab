import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Link2Off, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthFooter, AuthShell } from "@/components/auth/AuthShell";
import { FormError, MIN_PASSWORD_LENGTH, PasswordInput, PasswordRule } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useFragmentToken } from "@/hooks/use-fragment-token";
import { api } from "@/lib/api";
import { errorCode, errorMessage } from "@/lib/errors";

function InvalidLink() {
  return (
    <AuthShell title="این پیوند دیگر کار نمی‌کند">
      <div className="flex items-start gap-3 p-6">
        <Link2Off className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-4 text-sm leading-7">
          <p>
            پیوند بازیابی ۳۰ دقیقه معتبر است و فقط یک بار کار می‌کند؛ با درخواست پیوند تازه هم پیوندهای قبلی باطل
            می‌شوند. ممکن است نشانی هنگام کپی ناقص مانده باشد.
          </p>
          <Button asChild>
            <Link to="/auth/forgot">درخواست پیوند تازه</Link>
          </Button>
        </div>
      </div>
      <AuthFooter>
        <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
          بازگشت به صفحهٔ ورود
        </Link>
      </AuthFooter>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  const token = useFragmentToken();
  const navigate = useNavigate();
  const { applyUser } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  useDocumentTitle("تعیین رمز عبور تازه");

  if (!token || invalid) return <InvalidLink />;

  const submit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError("رمز عبور باید حداقل ۸ نویسه باشد.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.auth.resetPassword(token, password);
      applyUser(user);
      toast.success("رمز عبور تازه ثبت شد و وارد حساب شدید.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (errorCode(err) === "INVALID_OR_EXPIRED_TOKEN") setInvalid(true);
      else setError(errorMessage(err, "رمز عبور ذخیره نشد. دوباره تلاش کنید."));
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="تعیین رمز عبور تازه"
      description="پس از ذخیره، روی همین دستگاه وارد می‌شوید و همهٔ نشست‌های دیگر بسته می‌شوند."
    >
      <form
        className="space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-password`}>رمز عبور تازه</Label>
          <PasswordInput
            id={`${id}-password`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={128}
            aria-describedby={`${id}-rule`}
            disabled={busy}
            autoFocus
            required
          />
          <PasswordRule id={`${id}-rule`} password={password} />
        </div>
        <FormError message={error} />
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          ذخیرهٔ رمز عبور و ورود
        </Button>
      </form>
    </AuthShell>
  );
}
