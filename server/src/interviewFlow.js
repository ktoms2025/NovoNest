// Chat delivery state machine (spec Section 3, Step 2). Code here decides
// what happens and when — the fixed warm-up turn, then each of the fixed
// questions from Step 1 in order, then wrap-up — so grading/report
// explainability stays deterministic. Each turn's actual candidate-facing
// wording (the acknowledgment + natural delivery) comes from one
// deliverInterviewTurn() call in anthropic.js.
import { randomUUID } from "crypto";
import { deliverInterviewTurn } from "./anthropic.js";
import { LeakGuardError } from "./leakGuard.js";

const DISCLOSURE_TEXT =
  "[PLACEHOLDER AI DISCLOSURE — not reviewed by Legal, prototype only: You're chatting with an AI Recruiter, not a human. This conversation is being recorded so a recruiter can review it before deciding on next steps.]";

// The very first message has no prior candidate answer to react to, so it
// stays static/scripted rather than an LLM call — no latency cost, and
// nothing here needs to vary. Deliberately says nothing about "practice"
// or being "scored": earlier testing showed that contrast (this one's
// unscored, implying the rest aren't) is itself a scoring signal. It's
// still tracked internally as the unscored warm-up turn (practice: true in
// the transcript) — the candidate just never sees that framing.
function buildOpeningMessage(candidate, role) {
  return [
    `Hi ${candidate.name}, thanks for taking the time to chat about the ${role.title} role today.`,
    DISCLOSURE_TEXT,
    "To start, tell me a little about your experience with customer-facing or call center work — whatever feels most relevant to you.",
  ].join("\n\n");
}

// Pre-written, fully static fallback content — used only if the turn LLM
// call fails the leak guard twice, or errors unexpectedly, mid-conversation
// (see deliverTurnSafely below). Never LLM-generated, so it's guaranteed
// clean: the question text itself already passed the same leak guard back
// in Step 1, and the acknowledgments/closing here are hand-written.
const FALLBACK_ACKNOWLEDGMENTS = [
  "Thanks for sharing that.",
  "Got it, thank you.",
  "Appreciate you walking me through that.",
];

const FALLBACK_CLOSING_MESSAGE =
  "Thanks so much for chatting with me today — I enjoyed hearing about your experience. A recruiter will be in touch soon with next steps.";

function pickFallbackAcknowledgment() {
  return FALLBACK_ACKNOWLEDGMENTS[Math.floor(Math.random() * FALLBACK_ACKNOWLEDGMENTS.length)];
}

/**
 * Calls deliverInterviewTurn and, if it fails (leak guard tripped twice, or
 * any other error — a network blip, a rate limit, anything), never lets
 * that reach the candidate as a raw error or broken message. Falls back to
 * pre-written safe text so the conversation continues cleanly, and logs
 * the failure loudly server-side for review. "Fail loudly" means loud in
 * the log, never loud in the candidate's chat window.
 */
async function deliverTurnSafely({ candidate, role, transcript, directive }) {
  try {
    const message = await deliverInterviewTurn({ candidate, role, transcript, directive });
    return { message, usedFallback: false };
  } catch (err) {
    if (!(err instanceof LeakGuardError)) {
      // Non-leak-guard failure (network error, rate limit, unexpected
      // schema miss, etc.) — anthropic.js hasn't logged this one, so do it
      // here before falling back.
      console.error(
        `[interview-turn] unexpected error delivering a turn for candidate ${candidate.candidate_id}, falling back to a pre-written safe message:`,
        err,
      );
    }
    const message =
      directive.type === "ask_question"
        ? `${pickFallbackAcknowledgment()} ${directive.question.candidate_facing_question}`
        : FALLBACK_CLOSING_MESSAGE;
    return { message, usedFallback: true };
  }
}

function pushTranscript(session, entry) {
  session.transcript.push({
    turn: session.transcript.length + 1,
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

/**
 * Builds the initial session state right after question generation, plus
 * the first recruiter message (static opening/warm-up turn).
 */
export function startSession({ candidate, role, questions }) {
  const session = {
    sessionId: randomUUID(),
    candidateId: candidate.candidate_id,
    candidateName: candidate.name,
    roleTitle: role.title,
    // Full objects are kept on the session (not just the id/title above) so
    // later turns and the leak guard have what they need without a lookup.
    candidate,
    role,
    questions,
    phase: "intro", // intro -> questions -> complete
    currentQuestionIndex: -1,
    transcript: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const openingMessage = buildOpeningMessage(candidate, role);

  pushTranscript(session, {
    speaker: "recruiter",
    message: openingMessage,
    practice: true,
    questionId: null,
  });

  return { session, recruiterMessage: openingMessage, done: false };
}

/**
 * Advances the state machine given the candidate's latest chat message.
 * Returns { session, recruiterMessage, done } — done=true once the closing
 * turn has been delivered (grading can then be triggered). Async: each
 * turn (after the static opening) is one Claude call.
 */
export async function respond(session, candidateMessage) {
  if (session.phase === "complete") {
    throw new Error("Interview already complete");
  }

  pushTranscript(session, {
    speaker: "candidate",
    message: candidateMessage,
    practice: session.phase === "intro",
    questionId: session.phase === "questions" ? session.questions[session.currentQuestionIndex].id : null,
  });

  let directive;
  if (session.phase === "intro") {
    session.phase = "questions";
    session.currentQuestionIndex = 0;
    directive = { type: "ask_question", question: session.questions[0] };
  } else {
    const isLast = session.currentQuestionIndex >= session.questions.length - 1;
    if (isLast) {
      session.phase = "complete";
      directive = { type: "wrap_up" };
    } else {
      session.currentQuestionIndex += 1;
      directive = { type: "ask_question", question: session.questions[session.currentQuestionIndex] };
    }
  }

  const { message: recruiterMessage, usedFallback } = await deliverTurnSafely({
    candidate: session.candidate,
    role: session.role,
    transcript: session.transcript,
    directive,
  });

  pushTranscript(session, {
    speaker: "recruiter",
    message: recruiterMessage,
    practice: false,
    questionId: directive.type === "ask_question" ? directive.question.id : null,
    ...(usedFallback ? { usedFallback: true } : {}),
  });

  session.updatedAt = new Date().toISOString();
  return { session, recruiterMessage, done: session.phase === "complete" };
}
