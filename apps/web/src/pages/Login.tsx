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
      setMsg({ text: `Sign-in link sent to ${email}. Open the email on this same device and tap the link.` });
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
            Sign in with your Google account. Only emails added by the Admin can sign in.
          </p>
        </div>
        <button className="btn primary big" onClick={google} disabled={busy}>
          Sign in with Google
        </button>
        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>
            No Gmail? Get a sign-in link by email
          </summary>
          <form onSubmit={link} className="form" style={{ padding: "12px 0 0" }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              <span className="hint">The free plan allows only 5 links per day — Google sign-in is better.</span>
            </div>
            <button className="btn big" disabled={busy || !email}>
              Send link
            </button>
          </form>
        </details>
        {msg && <p className={msg.error ? "small" : "small muted"} style={msg.error ? { color: "var(--crit)", fontWeight: 600 } : undefined}>{msg.text}</p>}
        {APP_ENV === "test" && <span className="pill warn">TEST version — real work happens on live</span>}
      </div>
    </div>
  );
}

export function NoAccess({ email }: { email: string }) {
  return (
    <div className="login-wrap">
      <div className="card login">
        <h1>No access yet</h1>
        <p>
          Signed in as <b>{email}</b>, but the Admin has not added this email to the app (or it is disabled).
        </p>
        <p className="muted">Ask Rohit Mishra (Admin) to add your email under Users &amp; Roles. This page will open automatically once added.</p>
        <button className="btn" onClick={() => logout()}>
          Sign in with another account
        </button>
      </div>
    </div>
  );
}
