import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useProfile } from "./auth";
import { db } from "./firebase";
import type { Project } from "./types";

interface ProjectCtx {
  projects: Project[];
  loading: boolean;
  current: Project | null;
  select: (id: string) => void;
}

const Ctx = createContext<ProjectCtx>({ projects: [], loading: true, current: null, select: () => {} });
const KEY = "bpmc.project";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Admin sab dekhta hai; baaki user sirf apne project (rules collection query nahi dete)
    if (profile.isAdmin) {
      return onSnapshot(query(collection(db, "projects"), orderBy("name")), (s) => {
        setProjects(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) })));
        setLoading(false);
      });
    }
    const map = new Map<string, Project>();
    if (profile.projectIds.length === 0) {
      setProjects([]);
      setLoading(false);
      return;
    }
    const unsubs = profile.projectIds.map((pid) =>
      onSnapshot(doc(db, "projects", pid), (d) => {
        if (d.exists()) map.set(pid, { id: pid, ...(d.data() as Omit<Project, "id">) });
        else map.delete(pid);
        setProjects([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
        setLoading(false);
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [profile.isAdmin, profile.projectIds]);

  const current = useMemo(() => projects.find((p) => p.id === selected) ?? projects[0] ?? null, [projects, selected]);

  const select = (id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  };

  return <Ctx.Provider value={{ projects, loading, current, select }}>{children}</Ctx.Provider>;
}

export function useProjects() {
  return useContext(Ctx);
}
