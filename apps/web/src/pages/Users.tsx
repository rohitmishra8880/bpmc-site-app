import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { saveMaster } from "../lib/audit";
import { useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { useProjects } from "../lib/projects";
import type { UserDoc } from "../lib/types";
import { Dialog, errorText, PageHead, useToast } from "../lib/ui";

type Row = UserDoc & { id: string; rev?: number };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin (poori access)",
  site_user: "Site User (entry, edit, report)",
};

export function Users() {
  const profile = useProfile();
  const toast = useToast();
  const { projects } = useProjects();
  const [rows, setRows] = useState<Row[]>([]);
  const [roles, setRoles] = useState<string[]>(["admin", "site_user"]);
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  useEffect(() => {
    const a = onSnapshot(collection(db, "users"), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as UserDoc) }))), (e) => toast(errorText(e), true));
    const b = onSnapshot(collection(db, "roles"), (s) => setRoles(["admin", ...s.docs.map((d) => d.id)]));
    return () => {
      a();
      b();
    };
  }, [toast]);

  if (!profile.isAdmin) return <div className="card empty">Yeh page sirf Admin ke liye hai.</div>;
  const pname = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      <PageHead title="Users & Roles" sub="Kaun login kar sakta hai, kya kar sakta hai, kaunsa project dikhe — sirf Admin">
        <button className="btn primary" onClick={() => setEditing("new")}>
          ＋ User jodo (email)
        </button>
      </PageHead>
      <section className="card tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Naam</th>
              <th>Email</th>
              <th>Role</th>
              <th>Project</th>
              <th>Haalat</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.name}</b>
                </td>
                <td>{r.id}</td>
                <td>{r.role === "admin" ? <span className="pill info">Admin</span> : (ROLE_LABEL[r.role] ?? r.role)}</td>
                <td className="wrap">{r.role === "admin" ? "Sab" : r.projectIds.map(pname).join(", ") || "—"}</td>
                <td>{r.active ? <span className="pill ok">Chalu</span> : <span className="pill neutral">Band</span>}</td>
                <td>
                  {r.id !== profile.email && (
                    <button className="btn sm" onClick={() => setEditing(r)}>
                      ✎ Badlo
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">Har user apne email / Google se login karta hai — OTP / link usi ke email par jaata hai. Apna khud ka Admin record yahan se nahi badal sakte (galti se lock na ho).</p>
      </section>
      {editing && <UserForm row={editing === "new" ? null : editing} roles={roles} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserForm({ row, roles, onClose }: { row: Row | null; roles: string[]; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const { projects } = useProjects();
  const [email, setEmail] = useState(row?.id ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [role, setRole] = useState(row?.role ?? "site_user");
  const [pids, setPids] = useState<string[]>(row?.projectIds ?? []);
  const [active, setActive] = useState(row?.active ?? true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = emailOk && name.trim() && (role === "admin" || pids.length > 0) && (!row || reason.trim().length >= 3);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await saveMaster(
        "users",
        email.trim().toLowerCase(),
        { name: name.trim(), role, projectIds: role === "admin" ? [] : pids, active },
        profile.email,
        row,
        row ? "UPDATE" : "CREATE",
        row ? reason.trim() : null,
      );
      toast(row ? "User badal diya ✓" : "User jud gaya ✓ — ab woh login kar sakta hai");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={row ? "User badlo" : "Naya user"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="u-email">Email *</label>
            <input id="u-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!row} />
          </div>
          <div className="field">
            <label htmlFor="u-name">Naam *</label>
            <input id="u-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="u-role">Role</label>
            <select id="u-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Haalat</span>
            <label className="check">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Chalu (login kar sake)
            </label>
          </div>
        </div>
        {role !== "admin" && (
          <div className="field">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Kaunse project dikhein *</span>
            <div className="checks">
              {projects.map((p) => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={pids.includes(p.id)} onChange={(e) => setPids(e.target.checked ? [...pids, p.id] : pids.filter((x) => x !== p.id))} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
        )}
        {row && (
          <div className="field">
            <label htmlFor="u-reason">Badalne ka kaaran *</label>
            <input id="u-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Radd
          </button>
          <button className="btn primary" disabled={!valid || busy}>
            Save karo
          </button>
        </div>
      </form>
    </Dialog>
  );
}
