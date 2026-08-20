// Chat delivery state machine (spec Section 3, Step 2 — "chat-based
// fallback mode", used as the only mode in Phase 1). This is deliberately
// NOT an LLM call: the questions were already generated in Step 1, so
// delivery is just presenting them one at a time and logging the
// transcript. Turn-taking here is scripted; only question generation and
// grading go through Claude.
import { randomUUID } from "crypto";

const DISCLOSURE_TEXT =
  "[PLACEHOLDER AI DISCLOSURE — not reviewed by Legal, prototype only: You are speaking with an AI Recruiter, not a human. This conversation is being recorded and will be reviewed, along with your existing assessment results, by a human recruiter before any hiring decision is made.]";

const PRACTICE_QUESTION =
  "Practice question (not scored): In a sentence or two, tell me a bit about your experience in customer-facing or call center roles.";

function pushTranscript(session, entry) {
  session.transcript.push({
    turn: session.transcript.length + 1,
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

/**
 * Builds the initial session state right after question generation, plus
 * the first recruiter message (intro + practice turn).
 */
export function startSession({ candidate, role, questions }) {
  const session = {
    sessionId: randomUUID(),
    candidateId: candidate.candidate_id,
    candidateName: candidate.name,
    roleTitle: role.title,
    questions,
    phase: "intro", // intro -> questions -> complete
    currentQuestionIndex: 0,
    transcript: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const introMessage = [
    `Hi ${candidate.name}, thanks for taking the time to do this pre-screen interview for the ${role.title} role.`,
    DISCLOSURE_TEXT,
    "This is a short text-based interview. Before the scored questions, let's do one quick practice turn so you know what to expect — it isn't scored.",
    PRACTICE_QUESTION,
  ].join("\n\n");

  pushTranscript(session, {
    speaker: "recruiter",
    message: introMessage,
    practice: true,
    questionId: null,
  });

  return { session, recruiterMessage: introMessage, done: false };
}

/**
 * Advances the state machine given the candidate's latest chat message.
 * Returns { session, recruiterMessage, done } — done=true once the last
 * scored question has been answered (grading can then be triggered).
 */
export function respond(session, candidateMessage) {
  if (session.phase === "complete") {
    throw new Error("Interview already complete");
  }

  pushTranscript(session, {
    speaker: "candidate",
    message: candidateMessage,
    practice: session.phase === "intro",
    questionId:
      session.phase === "questions"
        ? session.questions[session.currentQuestionIndex].id
        : null,
  });

  let recruiterMessage;
  let done = false;

  if (session.phase === "intro") {
    session.phase = "questions";
    const first = session.questions[0];
    recruiterMessage = [
      "Thanks! Now let's get into the questions for this role.",
      `Question 1 of ${session.questions.length}: ${first.prompt}`,
    ].join("\n\n");
    pushTranscript(session, {
      speaker: "recruiter",
      message: recruiterMessage,
      practice: false,
      questionId: first.id,
    });
  } else {
    const isLast = session.currentQuestionIndex >= session.questions.length - 1;
    if (isLast) {
      session.phase = "complete";
      recruiterMessage =
        "That's the end of the interview questions. Thanks for your time — your responses will be reviewed, and a recruiter will follow up with next steps.";
      pushTranscript(session, {
        speaker: "recruiter",
        message: recruiterMessage,
        practice: false,
        questionId: null,
      });
      done = true;
    } else {
      session.currentQuestionIndex += 1;
      const next = session.questions[session.currentQuestionIndex];
      recruiterMessage = `Question ${session.currentQuestionIndex + 1} of ${session.questions.length}: ${next.prompt}`;
      pushTranscript(session, {
        speaker: "recruiter",
        message: recruiterMessage,
        practice: false,
        questionId: next.id,
      });
    }
  }

  session.updatedAt = new Date().toISOString();
  return { session, recruiterMessage, done };
}
