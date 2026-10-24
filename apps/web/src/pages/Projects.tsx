import { useState } from "react";
import { formatDate, formatINR, toPaise } from "@bpmc/core";
import { saveMaster } from "../lib/audit";
import { useProfile } from "../lib/auth";
import { useProjects } from "../lib/projects";
import type { Project } from "../lib/types";
import { Dialog, errorText, PageHead, useToast } from "../lib/ui";

export function Projects() {
  const profile = useProfile();
  const { projects, current, select } = useProjects();
  const [editing, setEditing] = useState<Project | "new" | null>(null);

  return (
    <>
      <PageHead title="Site Projects & Locations" sub="Sab site, jagah, client, timeline aur budget">
        {profile.isAdmin && (
          <button className="btn primary" onClick={() => setEditing("new")}>
            ＋ Naya project
          </button>
        )}
      </PageHead>
      {projects.length === 0 && <div className="card empty">Abhi koi project nahi.</div>}
      <div className="mods" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {projects.map((p) => (
          <button
            key={p.id}
            className="card"
            onClick={() => select(p.id)}
            style={{ padding: 16, textAlign: "left", display: "grid", gap: 8, borderWidth: p.id === current?.id ? 2 : 1, borderColor: p.id === current?.id ? "var(--ink)" : undefined }}
          >
            <b style={{ fontSize: 17 }}>{p.name}</b>
            <span className="small muted">
              {p.code} · {p.place}
            </span>
            <span className="small">Client: {p.client || "—"}</span>
            <span className="small muted">
              {p.startDate ? formatDate(p.startDate) : "—"} → {p.endDate ? formatDate(p.endDate) : "—"}
            </span>
            <span className="small">Budget: {p.budgetPaise ? formatINR(p.budgetPaise) : "—"}</span>
            {p.id === current?.id && <span className="pill info">Abhi chuna hua</span>}
          </button>
        ))}
      </div>
      {current && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{current.name}</h2>
              <p className="small muted">Obsidian vault: {current.vault || "—"}</p>
            </div>
            {profile.isAdmin && (
              <button className="btn sm" onClick={() => setEditing(current)}>
                ✎ Badlo
              </button>
            )}
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zone / Sector</th>
                </tr>
              </thead>
              <tbody>
                {(current.zones ?? []).map((z) => (
                  <tr key={z}>
                    <td>{z}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!current.zones?.length && <div className="empty">Koi zone nahi joda</div>}
          </div>
        </section>
      )}
      {editing && <ProjectForm row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ProjectForm({ row, onClose }: { row: Project | null; onClose: () => void }) {
  const profile = useProfile();
  const toast = useToast();
  const [v, setV] = useState({
    id: row?.id ?? "",
    name: row?.name ?? "",
    code: row?.code ?? "",
    place: row?.place ?? "",
    client: row?.client ?? "",
    startDate: row?.startDate ?? "",
    endDate: row?.endDate ?? "",
    budget: row?.budgetPaise ? String(row.budgetPaise / 100) : "",
    zones: (row?.zones ?? []).join("\n"),
    vault: row?.vault ?? "",
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const idOk = /^[A-Z]{2,6}$/.test(v.id);
  const valid = idOk && v.name.trim() && v.code.trim() && (!row || reason.trim().length >= 3);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await saveMaster(
        "projects",
        v.id,
        {
          name: v.name.trim(),
          code: v.code.trim(),
          place: v.place.trim(),
          client: v.client.trim(),
          startDate: v.startDate,
          endDate: v.endDate,
          budgetPaise: v.budget ? toPaise(Number(v.budget)) : 0,
          zones: v.zones.split("\n").map((z) => z.trim()).filter(Boolean),
          vault: v.vault.trim(),
          status: row?.status ?? "ACTIVE",
        },
        profile.email,
        row,
        row ? "UPDATE" : "CREATE",
        row ? reason.trim() : null,
      );
      toast(row ? "Project badal diya ✓" : "Project jud gaya ✓");
      onClose();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={row ? "Project badlo" : "Naya project"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="grid-form">
          <div className="field">
            <label htmlFor="p-id">Chhota code (ID) *</label>
            <input id="p-id" className="input" value={v.id} onChange={(e) => setV({ ...v, id: e.target.value.toUpperCase() })} disabled={!!row} placeholder="KSK" />
            <span className={idOk || !v.id ? "hint" : "err"}>2–6 English capital akshar; baad mein nahi badlega</span>
          </div>
          <div className="field">
            <label htmlFor="p-code">Project code *</label>
            <input id="p-code" className="input" value={v.code} onChange={set("code")} placeholder="BPMC-KSK" />
          </div>
          <div className="field">
            <label htmlFor="p-name">Naam *</label>
            <input id="p-name" className="input" value={v.name} onChange={set("name")} placeholder="EMRS Keshkal" />
          </div>
          <div className="field">
            <label htmlFor="p-place">Jagah</label>
            <input id="p-place" className="input" value={v.place} onChange={set("place")} />
          </div>
          <div className="field">
            <label htmlFor="p-client">Client / Vibhag</label>
            <input id="p-client" className="input" value={v.client} onChange={set("client")} />
          </div>
          <div className="field">
            <label htmlFor="p-budget">Budget (₹)</label>
            <input id="p-budget" className="input" inputMode="decimal" value={v.budget} onChange={set("budget")} />
          </div>
          <div className="field">
            <label htmlFor="p-start">Shuru</label>
            <input id="p-start" type="date" className="input" value={v.startDate} onChange={set("startDate")} />
          </div>
          <div className="field">
            <label htmlFor="p-end">Khatam (tender ke hisab)</label>
            <input id="p-end" type="date" className="input" value={v.endDate} onChange={set("endDate")} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-zones">Zone / Sector (har line mein ek)</label>
          <textarea id="p-zones" className="input" rows={4} value={v.zones} onChange={set("zones")} />
        </div>
        <div className="field">
          <label htmlFor="p-vault">Obsidian vault folder</label>
          <input id="p-vault" className="input" value={v.vault} onChange={set("vault")} placeholder="EMRS KESHKAL" />
          <span className="hint">G:\My Drive\AI obsidian ke andar ka folder</span>
        </div>
        {row && (
          <div className="field">
            <label htmlFor="p-reason">Badalne ka kaaran *</label>
            <input id="p-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
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
