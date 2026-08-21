import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api.js";

const COVERAGE_LABEL = {
  assessed: { text: "Assessed", cls: "badge-good" },
  partial: { text: "Partial", cls: "badge-warn" },
  not_assessed: { text: "Not assessed", cls: "badge-bad" },
};

const RECOMMENDATION_CLS = {
  Progress: "badge-good",
  Waitlist: "badge-warn",
  Reject: "badge-bad",
};

const SEVERITY_CLS = {
  low: "badge-neutral",
  medium: "badge-warn",
  high: "badge-bad",
};

function findCandidateAnswer(transcript, questionId) {
  const entry = transcript.find(
    (t) => t.speaker === "candidate" && t.questionId === questionId && !t.practice,
  );
  return entry?.message ?? "(no response recorded)";
}

export default function ReportPage() {
  const { sessionId } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getReport(sessionId).then(setReport).catch((err) => setError(err.message));
  }, [sessionId]);

  if (error) return <div className="card error-card">Failed to load report: {error}</div>;
  if (!report) return <div className="card">Loading report…</div>;

  const { role, candidate, questions, transcript, grading } = report;
  const { dimension_scores, consistency_flags, overall_summary, recommendation, recommendation_reasoning } =
    grading;

  return (
    <div className="report">
      <section className="card recommendation-card">
        <div className="recommendation-row">
          <span className={`badge badge-lg ${RECOMMENDATION_CLS[recommendation] || "badge-neutral"}`}>
            {recommendation}
          </span>
          <h2>Recommendation for {candidate.name}</h2>
        </div>
        <p>{recommendation_reasoning}</p>
        <p className="muted">{overall_summary}</p>
      </section>

      <section className="card">
        <h3>Candidate snapshot</h3>
        <div className="snapshot-grid">
          <div>
            <h4>Role</h4>
            <p>
              {role.title} <span className="muted">({role.req_id})</span>
            </p>
            <p className="muted">Applied {candidate.applied_date}</p>
          </div>
          <div>
            <h4>Blueprint coverage</h4>
            <div className="badge-row">
              {Object.entries(candidate.blueprint_coverage).map(([dim, status]) => (
                <span key={dim} className={`badge ${COVERAGE_LABEL[status]?.cls || "badge-neutral"}`}>
                  {dim}: {COVERAGE_LABEL[status]?.text || status}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="snapshot-grid">
          <div>
            <h4>Hard skills</h4>
            <ul className="score-list">
              {Object.entries(candidate.hard_skills).map(([k, v]) => (
                <li key={k}>
                  <span>{k.replaceAll("_", " ")}</span>
                  <strong>{v}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Personality</h4>
            <ul className="score-list">
              {Object.entries(candidate.personality.big_five).map(([k, v]) => (
                <li key={k}>
                  <span>{k.replaceAll("_", " ")}</span>
                  <strong>{v}</strong>
                </li>
              ))}
              <li>
                <span>integrity</span>
                <strong>{candidate.personality.integrity}</strong>
              </li>
              <li>
                <span>impression management</span>
                <strong>{candidate.personality.impression_management}</strong>
              </li>
            </ul>
            <p className="muted">RIASEC: {candidate.personality.riasec_top_codes.join(", ")}</p>
          </div>
          <div>
            <h4>AI Sample scenarios</h4>
            <ul className="score-list">
              {candidate.ai_sample.scenarios.map((s) => (
                <li key={s.name} className="score-list-note">
                  <div>
                    <span>{s.name}</span>
                    <strong>{s.score}</strong>
                  </div>
                  <p className="muted">{s.rubric_notes}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Interview questions asked</h3>
        <table className="report-table">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Question</th>
              <th>Why it was asked</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id}>
                <td>
                  <span className="badge badge-neutral">{q.dimension}</span>
                </td>
                <td>{q.candidate_facing_question}</td>
                <td className="muted">
                  {q.internal_rationale}
                  <br />
                  <em>Source: {q.source_signal}</em>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Scored responses</h3>
        <table className="report-table">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Question &amp; response</th>
              <th>Score</th>
              <th>Explanation</th>
            </tr>
          </thead>
          <tbody>
            {dimension_scores.map((d) => {
              const question = questions.find((q) => q.id === d.question_id);
              return (
                <tr key={d.question_id}>
                  <td>
                    <span className="badge badge-neutral">{d.dimension}</span>
                  </td>
                  <td>
                    <p>
                      <strong>Q:</strong> {question?.candidate_facing_question}
                    </p>
                    <p className="muted">
                      <strong>A:</strong> {findCandidateAnswer(transcript, d.question_id)}
                    </p>
                  </td>
                  <td className="score-cell">{d.score}</td>
                  <td className="muted">{d.explanation}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Consistency flags</h3>
        {consistency_flags.length === 0 ? (
          <p className="muted">No consistency flags — interview responses aligned with existing assessment data.</p>
        ) : (
          <ul className="flag-list">
            {consistency_flags.map((f, i) => (
              <li key={i}>
                <span className={`badge ${SEVERITY_CLS[f.severity] || "badge-neutral"}`}>{f.severity}</span>
                <div>
                  <p>{f.description}</p>
                  <p className="muted">Conflicts with: {f.related_assessment_field}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <details>
          <summary>Full transcript</summary>
          <div className="chat-log chat-log-static">
            {transcript.map((t) => (
              <div key={t.turn} className={`chat-bubble chat-${t.speaker}`}>
                <div className="chat-speaker">
                  {t.speaker === "recruiter" ? "AI Recruiter" : candidate.name}
                  {t.practice ? " (practice, unscored)" : ""}
                </div>
                <div className="chat-text">{t.message}</div>
              </div>
            ))}
          </div>
        </details>
      </section>

      <Link to="/" className="btn btn-secondary">
        ← Back to candidate list
      </Link>
    </div>
  );
}
