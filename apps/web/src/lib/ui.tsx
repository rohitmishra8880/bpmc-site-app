import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { msg: string; error?: boolean } | null;
const ToastCtx = createContext<(msg: string, error?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Toast>(null);
  const show = useCallback((msg: string, error = false) => {
    setT({ msg, error });
    window.setTimeout(() => setT(null), error ? 5000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div className={`toast ${t.error ? "error" : ""}`} role="status">
          {t.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Firestore / rules errors in plain words */
export function errorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("permission-denied")) return "Not allowed — your role cannot do this, or the day is locked.";
  if (code.includes("unavailable")) return "No network — saved on this phone, will sync when online.";
  return (e as Error)?.message ?? "Something went wrong";
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="dlg-bg" onClick={onClose}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Ask for a reason (delete / restore) — browser prompt() is not reliable */
export function ReasonDialog({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 3;
  return (
    <Dialog title={title} onClose={onCancel}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onConfirm(reason.trim());
        }}
      >
        <div className="field">
          <label htmlFor="reason">Reason (required)</label>
          <input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. entered twice by mistake" autoFocus />
          <span className="hint">Kept permanently in Edit History.</span>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!ok}>
            Confirm
          </button>
        </div>
      </form>
    </Dialog>
  );
}
