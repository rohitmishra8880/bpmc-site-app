// Photo wali haazri (Rohit): staff + company labour zaroori, thekedar ke aadmi optional.
// Do tareeke: camera se abhi (browser GPS + abhi ka samay), ya staff ki bheji photo upload — jiske andar (EXIF) tarikh, samay, GPS ho.
import { collection, doc } from "firebase/firestore";
import { useRef, useState } from "react";
import { exifPhotoCheck, gpsLabel, readExif, toBusinessDateIST, type AttendancePhotoNeed, type Gps } from "@bpmc/core";
import { useProfile } from "../lib/auth";
import { writeEntries, type EntryCol, type EntryWrite } from "../lib/entries";
import { db } from "../lib/firebase";
import { getPosition, PHOTOS_READY, shrink, uploadPhoto } from "../lib/photos";
import { Dialog, errorText, useToast } from "../lib/ui";
import { refKey } from "./Photos";

export interface PickedPhoto {
  fileId: string;
  name: string;
  mime: string;
  gps: Gps | null;
  takenAt: string;
  source: "CAMERA" | "UPLOAD";
  preview: string;
}

/** Entry ka id pehle se — taaki photo usi save mein usi entry se jude */
export const newEntryId = (pid: string, col: EntryCol) => doc(collection(db, "projects", pid, col)).id;

/** Photo ka record (photos collection) — haazri entry ke saath ek hi batch mein */
export function photoWrite(p: PickedPhoto, o: { date: string; refCol: EntryCol; refId: string; label: string; by: string }): EntryWrite {
  return {
    col: "photos",
    current: null,
    action: "CREATE",
    data: {
      businessDate: o.date, refKey: refKey(o.refCol, o.refId), refCol: o.refCol, refId: o.refId, label: o.label,
      driveFileId: p.fileId, name: p.name, mime: p.mime, lat: p.gps?.lat ?? null, lng: p.gps?.lng ?? null, accuracyM: p.gps?.accuracyM ?? null,
      takenAt: p.takenAt, takenDate: toBusinessDateIST(new Date(p.takenAt)), source: p.source, uploadedBy: p.source === "UPLOAD" ? o.by : null,
    },
  };
}

const istTime = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 36e5).toISOString().slice(11, 16);

export function AttendancePhotoField({ pid, date, label, need, facing, value, onChange, hasExisting }: {
  pid: string;
  date: string;
  label: string;
  need: AttendancePhotoNeed;
  facing: "user" | "environment";
  value: PickedPhoto | null;
  onChange: (p: PickedPhoto | null) => void;
  /** Is entry se pehle hi photo judi hai */
  hasExisting?: boolean;
}) {
  const toast = useToast();
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (need === "NONE") return null;

  const finish = async (img: { data: string; mime: string }, gps: Gps | null, takenAt: string, source: PickedPhoto["source"]) => {
    setBusy("Uploading to Drive…");
    const up = await uploadPhoto({ pid, date, time: istTime(takenAt), label, seq: 1, data: img.data, mime: img.mime, gps, takenAt });
    onChange({ fileId: up.fileId, name: up.name, mime: img.mime, gps, takenAt, source, preview: `data:${img.mime};base64,${img.data}` });
  };

  const fromCamera = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    try {
      setBusy("Reading photo…");
      const img = await shrink(f);
      setBusy("Getting GPS…");
      const gps = await getPosition();
      await finish(img, gps, new Date().toISOString(), "CAMERA");
      if (!gps) toast("Photo saved without GPS — location was not allowed");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
      if (cam.current) cam.current.value = "";
    }
  };

  const fromPhone = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    try {
      setBusy("Checking date, time and GPS inside the photo…");
      // EXIF asli file se — chhota karne (canvas) ke baad mit jaata hai
      const check = exifPhotoCheck(readExif(new Uint8Array(await f.arrayBuffer())), date);
      if (!check.ok) {
        setErr(check.error);
        return;
      }
      setBusy("Reading photo…");
      const img = await shrink(f);
      await finish(img, check.gps, check.takenAt, "UPLOAD");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
      if (gal.current) gal.current.value = "";
    }
  };

  const offline = !navigator.onLine;
  return (
    <div className="field">
      <label>
        Photo {need === "REQUIRED" ? <span className="pill crit" style={{ fontSize: 11 }}>Required</span> : <span className="pill neutral" style={{ fontSize: 11 }}>Optional</span>}
      </label>
      {value ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <img src={value.preview} alt="Attendance" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10 }} />
          <div className="small">
            <div>✓ {value.source === "UPLOAD" ? "Uploaded (date + GPS checked)" : "Taken now"} · {istTime(value.takenAt)}</div>
            <div>📍 {gpsLabel(value.gps)}</div>
            <button type="button" className="btn sm" onClick={() => onChange(null)} style={{ marginTop: 4 }}>Change photo</button>
          </div>
        </div>
      ) : hasExisting ? (
        <span className="hint">✓ A photo is already attached to this entry</span>
      ) : !PHOTOS_READY ? (
        <span className="hint">Photo upload is not set up on this server yet.</span>
      ) : offline ? (
        <span className="hint">No internet — save now and add the photo later (⚠️ button) when the network is back.</span>
      ) : (
        <>
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            <input ref={cam} type="file" accept="image/*" capture={facing} hidden onChange={(e) => void fromCamera(e.target.files?.[0])} />
            <input ref={gal} type="file" accept="image/jpeg" hidden onChange={(e) => void fromPhone(e.target.files?.[0])} />
            <button type="button" className="btn primary" disabled={!!busy} onClick={() => cam.current?.click()}>📷 Take photo</button>
            <button type="button" className="btn" disabled={!!busy} onClick={() => gal.current?.click()}>🖼 Upload from phone</button>
          </div>
          <span className="hint">{busy ?? "Upload: the photo must have date, time and GPS inside — on WhatsApp it must be sent as a Document, not as a photo."}</span>
        </>
      )}
      {err && <span className="err">{err}</span>}
    </div>
  );
}

/** Pehle se lagi haazri mein baad mein photo jodna (⚠️ No photo) */
export function AttachPhotoDialog({ pid, date, refCol, refId, label, need, facing, onClose }: {
  pid: string;
  date: string;
  refCol: EntryCol;
  refId: string;
  label: string;
  need: AttendancePhotoNeed;
  facing: "user" | "environment";
  onClose: () => void;
}) {
  const profile = useProfile();
  const toast = useToast();
  const [pic, setPic] = useState<PickedPhoto | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!pic) return;
    setSaving(true);
    try {
      await writeEntries(pid, profile.email, [photoWrite(pic, { date, refCol, refId, label, by: profile.email })], null);
      toast("Photo attached ✓");
      onClose();
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog title={`Photo — ${label}`} onClose={onClose}>
      <div className="form">
        <AttendancePhotoField pid={pid} date={date} label={label} need={need === "NONE" ? "OPTIONAL" : need} facing={facing} value={pic} onChange={setPic} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!pic || saving} onClick={() => void save()}>Save photo</button>
        </div>
      </div>
    </Dialog>
  );
}
