import { Routes, Route, Link } from "react-router-dom";
import CandidateListPage from "./pages/CandidateListPage.jsx";
import InterviewPage from "./pages/InterviewPage.jsx";
import ReportPage from "./pages/ReportPage.jsx";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-title">
          AI Pre-Screen Interview Tool
        </Link>
        <span className="app-subtitle">Prototype &middot; Phase 1 (text-only)</span>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<CandidateListPage />} />
          <Route path="/interview/:candidateId" element={<InterviewPage />} />
          <Route path="/report/:sessionId" element={<ReportPage />} />
        </Routes>
      </main>
    </div>
  );
}
