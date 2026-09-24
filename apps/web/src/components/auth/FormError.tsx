import { AlertCircle } from "lucide-react";
import s from "./auth.module.css";

export function FormError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className={s.formError} role="alert">
      <AlertCircle size={18} strokeWidth={1.8} aria-hidden />
      <span>{children}</span>
    </div>
  );
}
