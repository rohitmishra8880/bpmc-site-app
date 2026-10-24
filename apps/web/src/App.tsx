import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell, Soon } from "./components/Shell";
import { AuthProvider, useAuth } from "./lib/auth";
import { ProjectProvider } from "./lib/projects";
import { ToastProvider } from "./lib/ui";
import { Dashboard } from "./pages/Dashboard";
import { EditHistory } from "./pages/EditHistory";
import { Login, NoAccess } from "./pages/Login";
import { Masters } from "./pages/Masters";
import { Projects } from "./pages/Projects";
import { Users } from "./pages/Users";

function Gate() {
  const s = useAuth();
  if (s.status === "loading") return <div className="login-wrap muted">Load ho raha hai…</div>;
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
          <Route path="inventory" element={<Soon title="Inventory (Material Hub)" phase="Phase 2" what="Diesel, Gitti, Reti, Steel, Cement, Bricks, Oil — aaya / kharch / baaki" />} />
          <Route path="store" element={<Soon title="Store / Saman Register" phase="Phase 2" what="Auzaar aur saman — aaya, thekedar ko diya, wapas" />} />
          <Route path="machinery" element={<Soon title="Machinery" phase="Phase 2" what="SR / CR, ghante, diesel, breakdown, rental" />} />
          <Route path="attendance" element={<Soon title="Attendance" phase="Phase 2" what="Staff KYC + khata, thekedar muster (Mistri / Kuli / Reja)" />} />
          <Route path="work" element={<Soon title="Daily Work" phase="Phase 2" what="Concrete M³, shuttering Sq M, steel Kg, photo" />} />
          <Route path="creditors" element={<Soon title="Creditors / Party Ledger" phase="Phase 2" what="Bill, bhugtan, bakaya" />} />
          <Route path="reports" element={<Soon title="Reports (DPR)" phase="Phase 3" what="Roz ki DPR — lock, version, PDF, WhatsApp, Obsidian" />} />
          <Route path="ai" element={<Soon title="AI Insights" phase="Phase 4" what="Asli data se sawaal-jawab" />} />
          <Route path="help" element={<Soon title="Help Center" phase="Phase 4" what="Calculator, SOP, emergency number" />} />
          <Route path="bin" element={<Soon title="Recycle Bin" phase="Phase 2" what="Hataayi entries — abhi Masters mein 'Hataye hue bhi dikhao' se wapas la sakte ho" />} />
          <Route path="settings" element={<Soon title="Settings & Backup" phase="Phase 1 ka agla hissa" what="Rental niyam, alert limit, backup / restore" />} />
          <Route path="*" element={<Soon title="Page nahi mila" phase="—" what="Yeh link galat hai" />} />
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
