import type { Timestamp } from "firebase/firestore";

export type Permission =
  | "entry.create"
  | "entry.edit"
  | "entry.delete"
  | "masters.edit"
  | "report.generate"
  | "day.unlock"
  | "recycle.restore"
  | "audit.read"
  | "users.manage"
  | "settings.manage"
  | "backup.manage";

export interface UserDoc {
  name: string;
  role: string;
  projectIds: string[];
  active: boolean;
  mobile?: string;
}

export interface Profile extends UserDoc {
  email: string;
  isAdmin: boolean;
  permissions: Permission[];
}

export interface Deleted {
  by: string;
  reason: string;
  at: Timestamp;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  place: string;
  client: string;
  startDate: string;
  endDate: string;
  budgetPaise: number;
  zones: string[];
  vault: string;
  status: "ACTIVE" | "CLOSED";
}

export interface AuditDoc {
  id: string;
  entity: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "OPEN";
  rev: number;
  by: string;
  at: Timestamp | null;
  reason: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  device?: string;
  projectId?: string;
}
