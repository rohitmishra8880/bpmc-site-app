import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";

export type MasterRow = DocumentData & { id: string; name: string };

/** Master list (hataye hue chhod ke), naam ke hisab se */
export function useMaster(col: string) {
  const [rows, setRows] = useState<MasterRow[]>([]);
  useEffect(
    () =>
      onSnapshot(collection(db, col), (s) =>
        setRows(
          s.docs
            .map((d) => ({ id: d.id, ...(d.data() as { name: string }) }))
            .filter((r) => !(r as DocumentData).deleted)
            .sort((a, b) => String(a.name).localeCompare(String(b.name))),
        ),
      ),
    [col],
  );
  return rows;
}
