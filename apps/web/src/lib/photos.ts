// Site photos: phone par chhoti karo (core fitSize), GPS + samay lo, Apps Script ko bhejo → Google Drive.
// Firebase Storage Spark plan par nahi milta; server (Apps Script) token verify karke vault\Photos mein rakhta hai.
import { fitSize, type Gps } from "@bpmc/core";
import { auth } from "./firebase";

const URL_ = (import.meta.env.VITE_PHOTO_URL as string | undefined) ?? "";
export const PHOTOS_READY = URL_.length > 0;
const MAX_SIDE = 1600;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!PHOTOS_READY) throw new Error("Photo upload is not set up yet — ask the Admin");
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again");
  // text/plain: browser pehle "preflight" nahi bhejta, Apps Script seedha chalta hai
  const res = await fetch(URL_, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token }) });
  const j = (await res.json()) as T & { ok: boolean; error?: string };
  if (!j.ok) throw new Error(j.error ?? "Photo server error");
  return j;
}

/** Photo ko lambi side 1600 px, JPEG — Drive aur mobile data bachta hai */
export async function shrink(file: File): Promise<{ data: string; mime: "image/jpeg"; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitSize(bmp.width, bmp.height, MAX_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Could not read the photo"))), "image/jpeg", 0.75));
  const data = await new Promise<string>((ok, no) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => no(new Error("Could not read the photo"));
    fr.readAsDataURL(blob);
  });
  return { data, mime: "image/jpeg", w, h };
}

/** GPS (8 second tak); na mile / mana ho to null — photo phir bhi jaati hai, "No GPS" ke saath */
export function getPosition(): Promise<Gps | null> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

export async function uploadPhoto(a: {
  pid: string;
  date: string;
  time: string;
  label: string;
  seq: number;
  data: string;
  mime: string;
  gps: Gps | null;
  takenAt: string;
}): Promise<{ fileId: string; name: string }> {
  const r = await call<{ fileId: string; name: string }>({
    action: "upload", pid: a.pid, date: a.date, time: a.time, label: a.label, seq: a.seq, mime: a.mime, data: a.data,
    lat: a.gps?.lat ?? null, lng: a.gps?.lng ?? null, accuracyM: a.gps?.accuracyM ?? null, takenAt: a.takenAt,
  });
  return { fileId: r.fileId, name: r.name };
}

const cache = new Map<string, Promise<string>>();
/** Drive se photo (data URL) — ek baar laao, phir yaad rakho */
export function fetchPhoto(pid: string, fileId: string): Promise<string> {
  let p = cache.get(fileId);
  if (!p) {
    p = call<{ mime: string; data: string }>({ action: "get", pid, fileId }).then((r) => `data:${r.mime};base64,${r.data}`);
    p.catch(() => cache.delete(fileId));
    cache.set(fileId, p);
  }
  return p;
}
