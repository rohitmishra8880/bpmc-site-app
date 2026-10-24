import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { can, useProfile } from "../lib/auth";
import { db } from "../lib/firebase";
import { useProjects } from "../lib/projects";
import type { AuditDoc } from "../lib/types";
import { errorText, PageHead, useToast } from "../lib/ui";

const ACTION: Record<AuditDoc["action"], [string, string]> = {
  CREATE: ["Naya bana", "ok"],
  UPDATE: ["Badla", "warn"],
  DELETE: ["Hataya", "crit"],
  RESTORE: ["Wapas laya", "info"],
  OPEN: ["Kholi", "neutral"],
};

function val(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function EditHistory() {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [scope, setScope] = useState<"project" | "global">("project");
  const [rows, setRows] = useState<AuditDoc[]>([]);

  useEffect(() => {
    if (scope === "project" && !current) return;
    const col = scope === "project" ? collection(db, "projects", current!.id, "auditLog") : collection(db, "auditLog");
    return onSnapshot(
      query(col, orderBy("at", "desc"), limit(200)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditDoc, "id">) }))),
      (e) => toast(errorText(e), true),
    );
  }, [scope, current, toast]);

  if (!can(profile, "audit.read")) return <div className="card empty">Edit History sirf Admin dekh sakta hai.</div>;

  return (
    <>
      <PageHead title="Edit History" sub="Kisne kya kiya, purani → nayi value, kab, kyun — koi (Admin bhi) mita nahi sakta" />
      <div className="tabs" role="group">
        <button className="tab" aria-pressed={scope === "project"} onClick={() => setScope("project")}>
          Site entry — {current?.name ?? "—"}
        </button>
        <button className="tab" aria-pressed={scope === "global"} onClick={() => setScope("global")}>
          Master list, users, project
        </button>
      </div>
      <section className="card tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Kab</th>
              <th>Kaun</th>
              <th>Kya</th>
              <th>Purani → nayi</th>
              <th>Kyun</th>
              <th>Device</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const [label, tone] = ACTION[r.action] ?? [r.action, "neutral"];
              const keys = Object.keys(r.after ?? {});
              return (
                <tr key={r.id}>
                  <td>{r.at ? r.at.toDate().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "…"}</td>
                  <td>{r.by}</td>
                  <td>
                    <span className={`pill ${tone}`}>{label}</span> <span className="small muted">{r.entity} · v{r.rev}</span>
                  </td>
                  <td className="wrap small">
                    {r.action === "CREATE"
                      ? "—"
                      : keys.length
                        ? keys.map((k) => (
                            <div key={k}>
                              <b>{k}</b>: {val(r.before?.[k])} → <b>{val(r.after?.[k])}</b>
                            </div>
                          ))
                        : "—"}
                  </td>
                  <td className="wrap">{r.reason ?? "—"}</td>
                  <td className="small muted">{r.device ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Abhi koi record nahi</div>}
      </section>
    </>
  );
}
