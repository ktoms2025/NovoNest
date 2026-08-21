import { Router } from "express";
import { getCandidate, getRole } from "../data.js";
import { generateQuestions, gradeInterview } from "../anthropic.js";
import { startSession, respond as advance } from "../interviewFlow.js";
import { getReport, getSession, saveReport, saveSession } from "../store.js";

export const interviewsRouter = Router();

// Step 1 (question generation) + start of Step 2 (delivery): create a new
// interview session for a candidate and send the intro/practice turn.
interviewsRouter.post("/", async (req, res) => {
  try {
    const { candidateId } = req.body || {};
    if (!candidateId) return res.status(400).json({ error: "candidateId is required" });

    const candidate = getCandidate(candidateId);
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });
    const role = getRole();

    const { questions } = await generateQuestions(candidate, role);
    const { session, recruiterMessage } = startSession({ candidate, role, questions });
    saveSession(session);

    res.status(201).json({
      sessionId: session.sessionId,
      candidateName: session.candidateName,
      roleTitle: session.roleTitle,
      totalQuestions: questions.length,
      phase: session.phase,
      recruiterMessage,
    });
  } catch (err) {
    console.error("Failed to start interview:", err);
    res.status(502).json({ error: "Failed to generate interview questions", detail: err.message });
  }
});

interviewsRouter.get("/:sessionId", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

// Step 2: one chat turn — record the candidate's message and advance the
// delivery state machine (warm-up turn, then each question, then wrap-up).
// Each turn after the first is one Claude call (see interviewFlow.js); a
// failure there is caught internally and falls back to safe pre-written
// text rather than ever reaching this handler, so the only errors caught
// here are genuine request problems (bad session id, empty message, etc.).
interviewsRouter.post("/:sessionId/respond", async (req, res) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const { message } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: "message is required" });

    const { session: updated, recruiterMessage, done } = await advance(session, message.trim());
    saveSession(updated);

    res.json({
      recruiterMessage,
      done,
      phase: updated.phase,
      currentQuestionIndex: updated.currentQuestionIndex,
      totalQuestions: updated.questions.length,
    });
  } catch (err) {
    console.error("Failed to advance interview:", err);
    res.status(400).json({ error: err.message });
  }
});

// Step 3 + 4: grade the completed transcript and produce the report.
interviewsRouter.post("/:sessionId/complete", async (req, res) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.phase !== "complete") {
      return res.status(400).json({ error: "Interview is not finished yet" });
    }

    const existing = getReport(session.sessionId);
    if (existing) return res.json(existing);

    const candidate = getCandidate(session.candidateId);
    const role = getRole();
    const grading = await gradeInterview(candidate, role, session.questions, session.transcript);

    const report = {
      sessionId: session.sessionId,
      generatedAt: new Date().toISOString(),
      role,
      candidate,
      questions: session.questions,
      transcript: session.transcript,
      grading,
    };
    saveReport(report);
    res.json(report);
  } catch (err) {
    console.error("Failed to grade interview:", err);
    res.status(502).json({ error: "Failed to grade interview", detail: err.message });
  }
});

interviewsRouter.get("/:sessionId/report", (req, res) => {
  const report = getReport(req.params.sessionId);
  if (!report) return res.status(404).json({ error: "Report not found — has the interview been completed?" });
  res.json(report);
});
