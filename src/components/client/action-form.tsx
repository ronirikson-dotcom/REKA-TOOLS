"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert, buttonClass, cn, Textarea } from "@/components/ui";
import { toast } from "./toaster";
import { MAX_SUBMIT_BYTES, prepareUpload } from "./prepare-upload";

export type ActionState = { ok: boolean; message?: string; error?: string; data?: Record<string, unknown> } | null;
export type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Bungkus server action: foto dikecilkan dulu di browser, lalu pesan sukses tampil sebagai toast
 * (dieksekusi sebelum UI di-refresh)
 */
function withToast(action: FormAction, notify = true): FormAction {
  return async (prev, fd) => {
    const upload = await prepareUpload(fd);
    if (upload.tooLarge) {
      return { ok: false, error: `Total lampiran terlalu besar (maks ${MAX_SUBMIT_BYTES / 1024 / 1024} MB sekali simpan). Kurangi jumlah file lalu coba lagi.` };
    }
    const res = await action(prev, upload.fd);
    if (notify && res?.ok && res.message) toast(res.message);
    return res;
  };
}

export function SubmitButton({ children, variant = "primary", className, pendingText = "Memproses...", disabled }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "success" | "warning" | "ghost"; className?: string; pendingText?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={cn(buttonClass(variant), className)}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Form yang memanggil server action dan menampilkan hasil/error (SRS 4.7) */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  showSuccess = true,
  inlineSuccess = false,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
  showSuccess?: boolean;
  /** Tampilkan pesan sukses di dalam form (untuk halaman tanpa toaster, mis. lupa password) */
  inlineSuccess?: boolean;
}) {
  const wrapped = useMemo(() => withToast(action, showSuccess && !inlineSuccess), [action, showSuccess, inlineSuccess]);
  const [state, formAction] = useActionState(wrapped, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {state?.error && (
        <div className="mb-3">
          <Alert tone="red">{state.error}</Alert>
        </div>
      )}
      {state?.ok && inlineSuccess && state.message && (
        <div className="mb-3 break-all">
          <Alert tone="green">{state.message}</Alert>
        </div>
      )}
      {children}
    </form>
  );
}

/**
 * Tombol aksi kritikal dengan konfirmasi dan (opsional) alasan wajib — BR-011, SRS 4.7.
 */
export function ConfirmButton({
  action,
  fields,
  label,
  title,
  description,
  variant = "secondary",
  size = "md",
  requireReason,
  reasonLabel = "Alasan",
  confirmLabel = "Ya, lanjutkan",
  extra,
}: {
  action: FormAction;
  fields: Record<string, string>;
  label: ReactNode;
  title?: string;
  description?: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "success" | "warning" | "ghost";
  size?: "sm" | "md";
  requireReason?: boolean;
  reasonLabel?: string;
  confirmLabel?: string;
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapped = useMemo(() => withToast(action), [action]);
  const [state, formAction] = useActionState(wrapped, null);
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  return (
    <>
      <button type="button" className={buttonClass(variant, size)} onClick={() => setOpen(true)}>
        {label}
      </button>
      {state?.ok === false && !open && <span className="text-xs text-red-600">{state.error}</span>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">{title ?? "Konfirmasi"}</h3>
            {description && <div className="mt-2 text-sm text-slate-600">{description}</div>}
            <form action={formAction} className="mt-4 space-y-3">
              {Object.entries(fields).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              {extra}
              {requireReason && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    {reasonLabel} <span className="text-red-500">*</span>
                  </span>
                  <Textarea name="reason" required minLength={3} autoFocus />
                </label>
              )}
              {state?.error && <Alert tone="red">{state.error}</Alert>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(false)}>
                  Batal
                </button>
                <SubmitButton variant={variant === "secondary" || variant === "ghost" ? "primary" : variant}>{confirmLabel}</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/** Tombol aksi sederhana tanpa dialog */
export function InlineAction({ action, fields, children, variant = "secondary", size = "sm" }: { action: FormAction; fields: Record<string, string>; children: ReactNode; variant?: "primary" | "secondary" | "danger" | "success" | "warning" | "ghost"; size?: "sm" | "md" }) {
  const wrapped = useMemo(() => withToast(action), [action]);
  const [state, formAction] = useActionState(wrapped, null);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <InlineSubmit variant={variant} size={size}>
        {children}
      </InlineSubmit>
      {state?.ok === false && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function InlineSubmit({ children, variant, size }: { children: ReactNode; variant: "primary" | "secondary" | "danger" | "success" | "warning" | "ghost"; size: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, size)}>
      {pending ? "..." : children}
    </button>
  );
}
