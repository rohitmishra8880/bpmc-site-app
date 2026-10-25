// Photo dialog: kisi entry (Daily Work / Store bill) ya "site" (din ki photos) se jude photo dekho, nayi jodo.
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { canEditDate, gpsLabel, toBusinessDateIST } from "@bpmc/core";
import { can, useProfile } from "../lib/auth";
import { softDeleteWrite, useUnlock, writeEntries, type Entry } from "../lib/entries";
import { db } from "../lib/firebase";
import { fetchPhoto, getPosition, PHOTOS_READY, shrink, uploadPhoto } from "../lib/photos";
import { Dialog, errorText, ReasonDialog, useToast } from "../lib/ui";

export const refKey = (refCol: string, refId: string) => `${refCol}/${refId}`;

/** Din ki saari photos — kisi bhi entry se jude ya "site" wali (count dikhane ke liye) */
export function useDayPhotos(pid: string | undefined, date: string): Entry[] {
  const [rows, setRows] = useState<Entry[]>([]);
  useEffect(() => {
    if (!pid) return;
    setRows([]);
    return onSnapshot(query(collection(db, "projects", pid, "photos"), where("businessDate", "==", date)), (s) =>
      setRows(s.docs.map((d) => ({ ...(d.data() as Omit<Entry, "id">), id: d.id }) as Entry).filter((r) => !r.deleted)),
    );
  }, [pid, date]);
  return rows;
}

function Thumb({ pid, p, onOpen }: { pid: string; p: Entry; onOpen: (src: string) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let stop = false;
    fetchPhoto(pid, p.driveFileId).then((s) => !stop && setSrc(s), () => !stop && setErr(true));
    return () => {
      stop = true;
    };
  }, [pid, p.driveFileId]);
  if (err) return <div className="empty small">Could not load</div>;
  if (!src) return <div className="empty small">Loading…</div>;
  return <img src={src} alt={p.label ?? "Site photo"} onClick={() => onOpen(src)} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 10, cursor: "zoom-in" }} />;
}

export function PhotoDialog({ pid, refCol, refId, date, label, title, photos, onClose }: {
  pid: string;
  refCol: string;
  refId: string;
  date: string;
  label: string;
  title: string;
  photos: Entry[];
  onClose: () => void;
}) {
  const profile = useProfile();
  const toast = useToast();
  const unlock = useUnlock(pid, date);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const key = refKey(refCol, refId);
  const mine = photos.filter((p) => p.refKey === key).sort((a, b) => String(a.takenAt).localeCompare(String(b.takenAt)));
  const open = canEditDate(date, new Date(), unlock ? { expiresAt: unlock } : null) && can(profile, "entry.create");

  const add = async (f: File | undefined) => {
    if (!f) return;
    try {
      setBusy("Reading photo…");
      const img = await shrink(f);
      setBusy("Getting GPS…");
      const gps = await getPosition();
      const now = new Date();
      const time = new Date(now.getTime() + 5.5 * 36e5).toISOString().slice(11, 16);
      setBusy("Uploading to Drive…");
      const up = await uploadPhoto({ pid, date, time, label, seq: mine.length + 1, data: img.data, mime: img.mime, gps, takenAt: now.toISOString() });
      await writeEntries(
        pid,
        profile.email,
        [{
          col: "photos", current: null, action: "CREATE",
          data: {
            businessDate: date, refKey: key, refCol, refId, label, driveFileId: up.fileId, name: up.name, mime: img.mime,
            lat: gps?.lat ?? null, lng: gps?.lng ?? null, accuracyM: gps?.accuracyM ?? null, takenAt: now.toISOString(),
            takenDate: toBusinessDateIST(now),
          },
        }],
        null,
      );
      toast(gps ? "Photo saved with GPS ✓" : "Photo saved (no GPS — location was not allowed)");
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setBusy(null);
      if (file.current) file.current.value = "";
    }
  };

  const remove = async (e: Entry, reason: string) => {
    try {
      await writeEntries(pid, profile.email, [softDeleteWrite("photos", e, profile.email, reason)], reason);
      toast("Deleted — moved to Recycle Bin (the Drive file stays safe)");
    } catch (err) {
      toast(errorText(err), true);
    }
  };

  return (
    <Dialog title={title} onClose={onClose}>
      <div className="form">
        {!PHOTOS_READY && <p className="small" style={{ background: "var(--warn-bg)", padding: 10, borderRadius: 10 }}>Photo upload is not set up on this server yet.</p>}
        {open && PHOTOS_READY && (
          <div className="actions">
            <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void add(e.target.files?.[0])} />
            <button className="btn primary big" disabled={!!busy} onClick={() => file.current?.click()}>
              📷 {busy ?? "Take / choose photo"}
            </button>
          </div>
        )}
        {mine.length === 0 && <div className="empty">No photos yet</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {mine.map((p) => (
            <div key={p.id} style={{ display: "grid", gap: 4 }}>
              <Thumb pid={pid} p={p} onOpen={setBig} />
              <div className="small muted">
                {new Date(p.takenAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                {p.serverStatus === "PENDING" && " ⏳"}
              </div>
              <div className="small">
                {p.lat != null ? (
                  <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">📍 {gpsLabel({ lat: p.lat, lng: p.lng, accuracyM: p.accuracyM })}</a>
                ) : (
                  <span className="muted">📍 No GPS</span>
                )}
              </div>
              {open && can(profile, "entry.delete") && (
                <button className="btn sm danger" onClick={() => setRemoving(p)} aria-label="Delete photo">🗑</button>
              )}
            </div>
          ))}
        </div>
      </div>
      {big && (
        <div className="dlg-bg" onClick={() => setBig(null)} style={{ zIndex: 70 }}>
          <img src={big} alt="Site photo" style={{ maxWidth: "96vw", maxHeight: "92vh", borderRadius: 12 }} />
        </div>
      )}
      {removing && (
        <ReasonDialog
          title="Delete this photo?"
          onCancel={() => setRemoving(null)}
          onConfirm={(reason) => {
            const e = removing;
            setRemoving(null);
            void remove(e, reason);
          }}
        />
      )}
    </Dialog>
  );
}
