import { useState } from "react";
import { Logo } from "../components/Logo";
import { loginWithGoogle, logout, sendEmailLink } from "../lib/auth";
import { APP_ENV } from "../lib/firebase";
import { errorText } from "../lib/ui";

export function Login() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await loginWithGoogle();
    } catch (e) {
      setMsg({ text: errorText(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await sendEmailLink(email.trim().toLowerCase());
      setMsg({ text: `Login link ${email} par bhej diya. Usi phone / laptop par email kholke link dabao.` });
    } catch (err) {
      setMsg({ text: errorText(err), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="card login">
        <div className="logo">
          <Logo size={64} />
          <div>
            <b>BP Mishra &amp; Co.</b>
            <span>INFRASTRUCTURE &amp; CONSTRUCTION</span>
          </div>
        </div>
        <div className="hazard" aria-hidden="true" />
        <div>
          <h1>Site Login</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Apne Google account se login karo. Admin ne jis email ko joda hai, sirf wahi chalega.
          </p>
        </div>
        <button className="btn primary big" onClick={google} disabled={busy}>
          Google se login karo
        </button>
        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>
            Gmail nahi hai? Email par link mangao
          </summary>
          <form onSubmit={link} className="form" style={{ padding: "12px 0 0" }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              <span className="hint">Free plan par roz sirf 5 link ja sakte hain — Google login behtar hai.</span>
            </div>
            <button className="btn big" disabled={busy || !email}>
              Link bhejo
            </button>
          </form>
        </details>
        {msg && <p className={msg.error ? "small" : "small muted"} style={msg.error ? { color: "var(--crit)", fontWeight: 600 } : undefined}>{msg.text}</p>}
        {APP_ENV === "test" && <span className="pill warn">TEST version — asli kaam live par hoga</span>}
      </div>
    </div>
  );
}

export function NoAccess({ email }: { email: string }) {
  return (
    <div className="login-wrap">
      <div className="card login">
        <h1>Abhi access nahi hai</h1>
        <p>
          <b>{email}</b> se login ho gaya, par Admin ne yeh email abhi app mein nahi joda (ya band hai).
        </p>
        <p className="muted">Rohit Mishra (Admin) se kahiye ki Users &amp; Roles mein aapka email jod dein. Judte hi yeh page khud khul jayega.</p>
        <button className="btn" onClick={() => logout()}>
          Doosre account se login
        </button>
      </div>
    </div>
  );
}
