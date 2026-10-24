import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, db } from "./firebase";
import type { Permission, Profile, UserDoc } from "./types";

const ALL_PERMISSIONS: Permission[] = [
  "entry.create", "entry.edit", "entry.delete", "masters.edit", "report.generate",
  "day.unlock", "recycle.restore", "audit.read", "users.manage", "settings.manage", "backup.manage",
];

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  /** Login ho gaya par Admin ne abhi jodna / chalu nahi kiya */
  | { status: "noAccess"; email: string }
  | { status: "ready"; user: User; profile: Profile };

const Ctx = createContext<AuthState>({ status: "loading" });
const EMAIL_KEY = "bpmc.emailForSignIn";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // Email link se aaye to login poora karo
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    let email: string | null = null;
    try {
      email = localStorage.getItem(EMAIL_KEY);
    } catch {
      /* private window */
    }
    if (!email) email = window.prompt("Please enter your email again to finish signing in") ?? "";
    signInWithEmailLink(auth, email, window.location.href)
      .then(() => {
        try {
          localStorage.removeItem(EMAIL_KEY);
        } catch {
          /* ignore */
        }
        window.history.replaceState(null, "", "/");
      })
      .catch(() => setState({ status: "signedOut" }));
  }, []);

  useEffect(() => {
    let unsubUser: (() => void) | undefined;
    let unsubRole: (() => void) | undefined;
    const stop = () => {
      unsubUser?.();
      unsubRole?.();
      unsubUser = unsubRole = undefined;
    };
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      stop();
      if (!user || !user.email) {
        setState({ status: "signedOut" });
        return;
      }
      const email = user.email.toLowerCase();
      unsubUser = onSnapshot(
        doc(db, "users", email),
        (snap) => {
          unsubRole?.();
          const data = snap.data() as UserDoc | undefined;
          if (!snap.exists() || !data?.active) {
            setState({ status: "noAccess", email });
            return;
          }
          if (data.role === "admin") {
            setState({ status: "ready", user, profile: { ...data, email, isAdmin: true, permissions: ALL_PERMISSIONS } });
            return;
          }
          unsubRole = onSnapshot(
            doc(db, "roles", data.role),
            (r) => {
              const permissions = ((r.data()?.permissions as Permission[] | undefined) ?? []).filter((p) => ALL_PERMISSIONS.includes(p));
              setState({ status: "ready", user, profile: { ...data, email, isAdmin: false, permissions } });
            },
            () => setState({ status: "noAccess", email }),
          );
        },
        // Rules ne mana kiya = is email ka user record nahi / band hai
        () => setState({ status: "noAccess", email }),
      );
    });
    return () => {
      stop();
      unsubAuth();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

/** Sirf "ready" ke andar wale pages ke liye. */
export function useProfile(): Profile {
  const s = useContext(Ctx);
  if (s.status !== "ready") throw new Error("useProfile login ke bina");
  return s.profile;
}

export function can(profile: Profile, p: Permission): boolean {
  return profile.isAdmin || profile.permissions.includes(p);
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(auth, provider);
}

export async function sendEmailLink(email: string) {
  await sendSignInLinkToEmail(auth, email, { url: `${window.location.origin}/`, handleCodeInApp: true });
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* ignore */
  }
}

export function logout() {
  return signOut(auth);
}
