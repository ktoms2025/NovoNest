import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function CandidateListPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getCandidates().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="card error-card">Failed to load candidates: {error}</div>;
  if (!data) return <div className="card">Loading candidates…</div>;

  const { role, candidates } = data;

  return (
    <div>
      <section className="card role-card">
        <h2>{role.title}</h2>
        <p className="muted">Req ID: {role.req_id}</p>
        <div className="badge-row">
          {role.blueprint_dimensions_required.map((dim) => (
            <span key={dim} className="badge badge-neutral">
              {dim}
            </span>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Candidates</h3>
        <p className="muted">
          Mock/synthetic assessment data — fictional candidates for prototype use only.
        </p>
        <table className="candidate-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Applied</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.candidate_id}>
                <td>{c.name}</td>
                <td className="muted">{c.applied_date}</td>
                <td className="table-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate(`/interview/${c.candidate_id}`)}
                  >
                    Start Pre-Screen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
