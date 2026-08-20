import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";

export default function InterviewPage() {
  const { candidateId } = useParams();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState(null);
  const [candidateName, setCandidateName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(true);
  const [sending, setSending] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setStarting(true);
    api
      .startInterview(candidateId)
      .then((res) => {
        if (cancelled) return;
        setSessionId(res.sessionId);
        setCandidateName(res.candidateName);
        setRoleTitle(res.roleTitle);
        setMessages([{ speaker: "recruiter", text: res.recruiterMessage }]);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setStarting(false));
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || done) return;

    setMessages((m) => [...m, { speaker: "candidate", text }]);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await api.respond(sessionId, text);
      setMessages((m) => [...m, { speaker: "recruiter", text: res.recruiterMessage }]);
      if (res.done) setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleGenerateReport() {
    setCompleting(true);
    setError(null);
    try {
      await api.completeInterview(sessionId);
      navigate(`/report/${sessionId}`);
    } catch (err) {
      setError(err.message);
      setCompleting(false);
    }
  }

  if (starting) return <div className="card">Generating interview questions for this candidate…</div>;
  if (error && !sessionId) return <div className="card error-card">Failed to start interview: {error}</div>;

  return (
    <div className="card interview-card">
      <div className="interview-header">
        <div>
          <h2>{candidateName}</h2>
          <p className="muted">{roleTitle} &middot; text-based pre-screen interview</p>
        </div>
      </div>

      <div className="chat-log">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-${m.speaker}`}>
            <div className="chat-speaker">{m.speaker === "recruiter" ? "AI Recruiter" : candidateName}</div>
            <div className="chat-text">{m.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <div className="error-text">{error}</div>}

      {!done ? (
        <form className="chat-input-row" onSubmit={handleSend}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type the candidate's response…"
            disabled={sending}
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={sending || !input.trim()}>
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      ) : (
        <div className="interview-done-row">
          <button className="btn btn-primary" onClick={handleGenerateReport} disabled={completing}>
            {completing ? "Grading interview…" : "Generate Report"}
          </button>
        </div>
      )}
    </div>
  );
}
