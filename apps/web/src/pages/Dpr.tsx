// DPR: server ka banaya snapshot dikhana, lock (digital approval), versions, PDF, WhatsApp. Phone yahan koi hisab nahi karta.
import { collection, doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { canEditDate, DPR_EMPTY_TEXT, dprSections, dprWhatsapp, formatDate, toBusinessDateIST, type DprMeta, type DprSnapshot } from "@bpmc/core";
import { DateBar } from "../components/DateBar";
import { can, useProfile } from "../lib/auth";
import { useDayEntries, useUnlock, writeEntries } from "../lib/entries";
import { db } from "../lib/firebase";
import { fetchPhoto } from "../lib/photos";
import { downloadPdf, Sheet } from "../lib/print";
import { useProjects } from "../lib/projects";
import { Dialog, errorText, PageHead, useToast } from "../lib/ui";

interface Version extends DocumentData {
  id: string;
  version: number;
  snapshot: DprSnapshot;
  by: string;
  note?: string;
  lockedBy?: string;
  lockedAt?: string;
}

export function Dpr() {
  const profile = useProfile();
  const toast = useToast();
  const { current } = useProjects();
  const [date, setDate] = useState(() => toBusinessDateIST(new Date()));
  const [dpr, setDpr] = useState<DocumentData | null | undefined>(undefined);
  const [versions, setVersions] = useState<Version[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const { rows: actions } = useDayEntries(current?.id, "dprActions", date);
  const unlock = useUnlock(current?.id, date);

  useEffect(() => {
    if (!current) return;
    setDpr(undefined);
    setVersions([]);
    setPick(null);
    const a = onSnapshot(doc(db, "projects", current.id, "dpr", date), (s) => setDpr(s.exists() ? s.data() : null));
    const b = onSnapshot(collection(db, "projects", current.id, "dpr", date, "versions"), (s) =>
      setVersions(s.docs.map((d) => ({ ...d.data(), id: d.id }) as Version).sort((x, y) => y.version - x.version)),
    );
    return () => {
      a();
      b();
    };
  }, [current, date]);

  const shown = useMemo(() => (pick ? versions.find((v) => v.version === pick) : null), [pick, versions]);
  if (!current) return <div className="card empty">Select a project first.</div>;

  const snapshot = (shown?.snapshot ?? dpr?.snapshot) as DprSnapshot | undefined;
  const locked = dpr?.status === "LOCKED";
  const pending = (actions ?? []).some((a) => a.serverStatus === "PENDING");
  const open = canEditDate(date, new Date(), unlock ? { expiresAt: unlock } : null) && can(profile, "entry.create");
  const meta: DprMeta = locked
    ? { version: shown?.version ?? dpr?.version, lockedBy: shown?.lockedBy ?? dpr?.lockedBy, lockedAt: shown?.lockedAt ?? dpr?.lockedAt, note: (shown?.version ?? dpr?.version) > 1 ? (shown?.note ?? dpr?.note) : null }
    : {};
  const title = `Daily Progress Report / दैनिक प्रगति रिपोर्ट${meta.version ? ` — v${meta.version}` : " — Draft"}`;
  const period = formatDate(date);

  const act = async (action: "GENERATE" | "LOCK") => {
    setBusy(true);
    try {
      await writeEntries(current.id, profile.email, [{ col: "dprActions", current: null, action: "CREATE", data: { businessDate: date, action } }], null);
      toast(action === "LOCK" ? "Sent for locking ✓ · server will lock within 5 minutes" : "Requested ✓ · server will prepare it within 5 minutes");
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const share = () => {
    if (!snapshot) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(dprWhatsapp(snapshot, meta))}`, "_blank", "noopener");
  };
  const copy = async () => {
    if (!snapshot) return;
    await navigator.clipboard.writeText(dprWhatsapp(snapshot, meta));
    toast("Summary copied");
  };

  return (
    <>
      <div className="no-print" style={{ display: "grid", gap: 12 }}>
        <DateBar title="Daily Report (DPR)" sub={`${current.name} — made only from real entries`} date={date} onChange={setDate} unlockedTill={unlock} />
        <PageHead title={period} sub={locked ? `Locked by ${dpr?.lockedBy} · ${dpr?.lockedAt}` : "Draft — check it, then lock it to approve"}>
          {locked ? <span className="pill ok">🔒 Locked · v{dpr?.version}</span> : dpr ? <span className="pill warn">Draft</span> : null}
          {pending && <span className="pill warn">⏳ Server is working (up to 5 min)</span>}
          {snapshot && <button className="btn primary" onClick={() => downloadPdf(current.name, `DPR ${meta.version ? `v${meta.version}` : "Draft"}`, period, true)}>⬇ PDF / Print</button>}
          {snapshot && <button className="btn" onClick={share}>WhatsApp</button>}
          {snapshot && <button className="btn" onClick={() => void copy()}>Copy</button>}
          {open && !pending && !dpr && <button className="btn dark" disabled={busy} onClick={() => void act("GENERATE")}>Prepare DPR</button>}
          {open && !pending && !locked && snapshot && <button className="btn dark" disabled={busy} onClick={() => setConfirm(true)}>🔒 Lock &amp; approve</button>}
        </PageHead>
        {versions.length > 1 && (
          <div className="tabs" role="group" aria-label="Version">
            <button className="tab" aria-pressed={!pick} onClick={() => setPick(null)}>Latest (v{versions[0]!.version})</button>
            {versions.slice(1).map((v) => (
              <button key={v.id} className="tab" aria-pressed={pick === v.version} onClick={() => setPick(v.version)}>v{v.version}</button>
            ))}
          </div>
        )}
        {locked && (shown?.version ?? dpr?.version) > 1 && <p className="small muted">Changed after locking: {shown?.note ?? dpr?.note}. Older versions stay safe above.</p>}
      </div>

      {dpr === undefined ? (
        <div className="card empty">Loading…</div>
      ) : !snapshot ? (
        <div className="card empty">No report for this day yet. It is prepared by the server when entries are made, or tap Prepare DPR.</div>
      ) : (
        <Sheet project={current.name} title={title} period={period}>
          {meta.lockedBy && (
            <p className="note-line">
              Approved by / अनुमोदित: <b>{meta.lockedBy}</b>
              {meta.lockedAt ? ` · ${meta.lockedAt}` : ""}
              {meta.note ? ` · Change / बदलाव: ${meta.note}` : ""}
            </p>
          )}
          {snapshot.empty && <p><b>{DPR_EMPTY_TEXT}</b></p>}
          {dprSections(snapshot).map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              <table>
                {s.head && (
                  <thead>
                    <tr>{s.head.map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                )}
                <tbody>
                  {s.rows.map((r, i) => (
                    <tr key={i} className={r[0]?.startsWith("Total") ? "tot" : undefined}>{r.map((c, j) => <td key={j} className="wrap">{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {s.note && <p className="note-line">{s.note}</p>}
            </section>
          ))}
          {snapshot.photos?.length > 0 && <PhotoGrid pid={current.id} photos={snapshot.photos} />}
        </Sheet>
      )}

      {confirm && (
        <Dialog title="Lock this DPR?" onClose={() => setConfirm(false)}>
          <div className="form">
            <p>Your name ({profile.name}) will be recorded as the approval for {period}. If an entry of this day changes later, a new version (v2…) is made and this one stays safe.</p>
            <div className="actions">
              <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn primary" disabled={busy} onClick={() => void act("LOCK")}>🔒 Lock &amp; approve</button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

function PhotoGrid({ pid, photos }: { pid: string; photos: DprSnapshot["photos"] }) {
  const [src, setSrc] = useState<Record<string, string>>({});
  useEffect(() => {
    let stop = false;
    photos.forEach((p) => {
      fetchPhoto(pid, p.driveFileId).then((s) => !stop && setSrc((x) => ({ ...x, [p.driveFileId]: s })), () => {});
    });
    return () => {
      stop = true;
    };
  }, [pid, photos]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 8 }}>
      {photos.map((p) => (
        <figure key={p.driveFileId} style={{ margin: 0, breakInside: "avoid" }}>
          {src[p.driveFileId] ? <img src={src[p.driveFileId]} alt={p.label} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }} /> : <div className="note-line">Loading photo…</div>}
          <figcaption className="note-line">{p.label} · {p.gps}</figcaption>
        </figure>
      ))}
    </div>
  );
}
