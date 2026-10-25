import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell, Soon } from "./components/Shell";
import { AuthProvider, useAuth } from "./lib/auth";
import { ProjectProvider } from "./lib/projects";
import { ToastProvider } from "./lib/ui";
import { Attendance } from "./pages/Attendance";
import { Creditors } from "./pages/Creditors";
import { Dashboard } from "./pages/Dashboard";
import { EditHistory } from "./pages/EditHistory";
import { Inventory } from "./pages/Inventory";
import { Machinery } from "./pages/Machinery";
import { Login, NoAccess } from "./pages/Login";
import { Masters } from "./pages/Masters";
import { Projects } from "./pages/Projects";
import { RecycleBin } from "./pages/RecycleBin";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { Store } from "./pages/Store";
import { Users } from "./pages/Users";

function Gate() {
  const s = useAuth();
  if (s.status === "loading") return <div className="login-wrap muted">Loading…</div>;
  if (s.status === "signedOut") return <Login />;
  if (s.status === "noAccess") return <NoAccess email={s.email} />;
  return (
    <ProjectProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="masters" element={<Masters />} />
          <Route path="users" element={<Users />} />
          <Route path="history" element={<EditHistory />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="store" element={<Store />} />
          <Route path="machinery" element={<Machinery />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="work" element={<Soon title="Daily Work" phase="Phase 2" what="Concrete M³, shuttering Sq M, steel Kg, photos" />} />
          <Route path="creditors" element={<Creditors />} />
          <Route path="reports" element={<Reports />} />
          <Route path="ai" element={<Soon title="AI Insights" phase="Phase 4" what="Questions answered from real site data" />} />
          <Route path="help" element={<Soon title="Help Center" phase="Phase 4" what="Calculators, SOPs, emergency contacts" />} />
          <Route path="bin" element={<RecycleBin />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Soon title="Page not found" phase="—" what="This link is not valid" />} />
        </Route>
      </Routes>
    </ProjectProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
