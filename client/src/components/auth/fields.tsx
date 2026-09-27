import { useState, type ComponentProps } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const MIN_PASSWORD_LENGTH = 8;

export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} dir="ltr" className={cn("h-11 pe-3 ps-11", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 left-0 flex w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={visible ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

/** The length rule under a new-password field; turns green once met. Reference it with aria-describedby. */
export function PasswordRule({ id, password }: { id: string; password: string }) {
  const met = password.length >= MIN_PASSWORD_LENGTH;
  return (
    <p id={id} className={cn("flex items-center gap-1.5 text-xs", met ? "text-success" : "text-muted-foreground")}>
      {met ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <span className="mx-1 size-1.5 rounded-full bg-current" aria-hidden />
      )}
      حداقل ۸ نویسه
    </p>
  );
}

export function FormError({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p className={cn("rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive", className)} role="alert">
      {message}
    </p>
  );
}
