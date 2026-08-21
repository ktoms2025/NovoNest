// Three structured-output Anthropic API calls:
//   1. generateQuestions — Step 1, once per interview
//   2. deliverInterviewTurn — Step 2, once per chat turn during the live
//      interview (added in spec v2 so the AI Recruiter can acknowledge the
//      candidate's last answer naturally, instead of a scripted "Question
//      X of Y"). Code decides which fixed question comes next or that it's
//      time to wrap up; this call only phrases that turn.
//   3. gradeInterview — Step 3, once per completed interview
// Question generation and grading are kept as two separate calls per the
// spec's explicit instruction, not one combined freeform call. All three
// force a single tool call whose input_schema is generated from the Zod
// schemas in schemas.js, then validate the returned tool input with that
// same schema — so the response is always either valid structured data or
// a thrown error, never freeform text.
//
// Note: this SDK version (@anthropic-ai/sdk 0.68.0, the current npm
// release at build time) does not yet expose `client.messages.parse()` /
// `output_config.format`. Forced tool use (tool_choice) is the stable,
// widely-supported way to get structured JSON out of the Messages API, so
// that's what's used here.
//
// IMPORTANT: no candidate values are ever interpolated into prompt strings.
// The candidate/role objects are passed as serialized JSON data blocks, so
// swapping server/data/mock-candidates.json (or MOCK_DATA_PATH) for a
// different dataset requires no changes here. The turn-delivery call
// (Step 2) additionally never receives the candidate's assessment data at
// all — it only needs the transcript and the fixed next-content directive,
// so there's nothing sensitive in its prompt to leak in the first place.
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { QuestionSetSchema, InterviewTurnSchema, GradingResultSchema } from "./schemas.js";
import { findLeaks, LeakGuardError } from "./leakGuard.js";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const QUESTION_GEN_SYSTEM_PROMPT = `You are the question-design component of an AI pre-screen interview tool used in a hiring pipeline. Given one candidate's completed assessment data and the role's blueprint coverage requirements, you generate a short, structured set of pre-screen interview questions for that candidate.

Every question has two strictly separate parts:
- candidate_facing_question: what the candidate actually sees and is asked, in a chat conversation.
- internal_rationale: for the recruiter's report only, never shown to the candidate.

Rules:
- Generate between 3 and 5 questions total.
- Every question must target a specific score, gap, or flag found in the candidate's assessment data (a notably low or high hard-skill score, a personality trait extreme, an AI Sample scenario result, or a blueprint dimension marked "not_assessed" or "partial"). Do not include generic small talk, icebreakers, or questions with no basis in the data.
- candidate_facing_question must read like something a warm, curious human recruiter would naturally ask out loud. It must NEVER contain: any number of any kind (scores, percentages, counts, dates); any internal field, dataset, or system name, in any form (e.g. "troubleshooting_logic," "data_entry_accuracy," "blueprint coverage," "AI Sample," "Big Five," "RIASEC," "integrity score"); or any language that signals to the candidate that they are being scored, tested, or evaluated ("assessment," "rubric," "score," "evaluate," "test"). It should sound like it's simply about their experience and approach to the job — the data behind it should be invisible to them. For example, if troubleshooting_logic scored low, don't ask about "troubleshooting logic" — ask something like "Walk me through how you'd handle a customer whose issue you can't immediately solve." If a blueprint dimension is unassessed, don't mention "blueprint" or "assessed" at all — just ask a question that would naturally surface that dimension.
- candidate_facing_question must also use plain, everyday language pitched at this actual candidate population: entry-level, high-volume call center hiring, where a typical candidate has a high school education and often no prior call center experience. Do not use corporate or academic vocabulary — banned words/phrases include "diagnose," "root cause," "leverage," "optimize," and "process discipline," and anything of that same register. Use simple sentence structure: one idea per sentence, phrased the way a person would actually say it out loud to a friend, not the way it would read in a training manual or job posting. If you would not naturally say a word in casual conversation, don't use it here.
- internal_rationale must have a plain-language explanation that explicitly names the specific field and value that triggered it, so a recruiter reading the report later can see exactly why the question exists. This is the one place that data belongs, and it is NOT subject to the plain-vocabulary rule above — internal_rationale (and source_signal) are recruiter-facing only, so keep them precise and technical; name exact fields and scores clearly rather than softening the language for a candidate audience that will never read them.
- Prioritize, in order: (1) blueprint dimensions marked "not_assessed" or "partial" for this role, (2) notably low or notably high hard-skill or AI Sample scores, (3) personality or integrity signals worth probing further.
- Where the data supports it, cover a mix of the five blueprint dimensions rather than clustering all questions on one dimension.
- Keep each candidate_facing_question concise (1-2 sentences) and answerable in a short chat response.
- Do not invent facts about the candidate beyond what is in the provided data.
- Call the submit_questions tool exactly once with your final output. Do not include any other commentary.`;

const INTERVIEW_TURN_SYSTEM_PROMPT = `You are a warm, experienced recruiter conducting a live pre-screen chat interview with a job candidate. This is a real conversation, not a form.

Each time you're called, you'll be given the conversation so far and told exactly what needs to happen in this turn — either a specific topic to ask about next, or an instruction to wrap up the interview. That content is fixed; your job is only to deliver it the way a thoughtful human recruiter would in the flow of a live chat.

Rules:
- Start by acknowledging what the candidate just said in their previous message. This acknowledgment MUST reference at least one concrete, specific detail they actually mentioned — a fact, an example, a number of years, a prior role or industry, a specific word or phrase they used. A transition sentence with no specific content in it is not an acknowledgment, even if it sounds warm — "Thanks for sharing that!" or "Great, now let's move on" are NOT acceptable, because they say nothing that proves you were listening to *this* candidate's *this* answer. For example, if the candidate says "I've done retail customer service for a few years but never worked a call center before," a real acknowledgment names that (retail background, no call center experience yet) before moving on — not a generic transition. Keep it to a short phrase or sentence; specific, not long.
- Then smoothly transition into the required next content (the next question, or the wrap-up). The transition should feel like a natural conversational segue, not an abrupt topic change.
- Before finalizing your message, check it against the previous candidate message: if someone reading both could not tell your acknowledgment was written for that specific answer (as opposed to any answer), rewrite it so they could.
- Ask about ONLY the topic you were given. Never skip it, never substitute a different question, never add extra questions of your own.
- NEVER include any number of any kind — no scores, percentages, counts, or statistics.
- NEVER reference internal field, system, or dataset names, or anything that reads like a database identifier (words joined with underscores, e.g. "troubleshooting_logic"). Speak the way a person talks, not the way a spreadsheet is labeled.
- NEVER use "Question X of Y," numbered lists, or any other labeling that makes this feel like a form or test.
- NEVER say or imply, directly or indirectly, that the candidate's answers are being scored, graded, evaluated, or assessed. Don't use words like "score," "assessment," "rubric," "evaluate," or "test." This should feel like a normal conversation with a person, start to finish.
- Keep your tone warm, relaxed, and low-pressure throughout, like a friendly recruiter easing into a chat — never clinical or interrogative.
- Use plain, everyday language throughout, pitched at this actual candidate population: entry-level, high-volume call center hiring, where a typical candidate has a high school education and often no prior call center experience. No corporate or academic vocabulary — banned words/phrases include "diagnose," "root cause," "leverage," "optimize," and "process discipline," and anything of that same register. Simple sentences, one idea at a time, the way you'd actually talk to a friend — not the way a training manual or business memo would put it.
- Keep the message brief: a short acknowledgment plus the next question or closing thought. A sentence or two of reaction, then the content — not a speech.
- When wrapping up: thank the candidate warmly, let them know a recruiter will be in touch with next steps, and do not ask anything further.
- Call the submit_turn tool exactly once with your final message. Do not include any other commentary.`;

const GRADING_SYSTEM_PROMPT = `You are the grading component of an AI pre-screen interview tool used in a hiring pipeline. Given a candidate's existing assessment data, the interview questions that were generated for them (with rationale), and the full chat transcript of their answers, you produce structured, explainable scores and a final recommendation.

Rules:
- Score every scored question's response from 0 to 100, on the same 0-100 scale as the candidate's existing hard-skill and AI Sample scores, tied to the blueprint dimension of its originating question. Ignore the practice/intro turn — it is not scored.
- Give a concrete, plain-language explanation for each score that references what the candidate actually said, not just the score itself.
- Flag any response that seems inconsistent with the candidate's existing assessment scores — for example, a candidate who claims strong process discipline verbally but scored low on hard_skills.data_entry_accuracy. Only raise a flag when there is genuine support in the data; it is normal and expected to return zero flags for a consistent candidate.
- Produce exactly one overall recommendation — "Progress" (to a human interview), "Waitlist", or "Reject" — by reasoning holistically across the interview dimension scores, any consistency flags, and the candidate's existing assessment data (hard_skills, personality, ai_sample, blueprint_coverage) together. There are no fixed numeric cutoffs to apply mechanically — use the same kind of holistic judgment an experienced recruiter would, and make that reasoning explicit and specific to this candidate in recommendation_reasoning.
- Call the submit_grading tool exactly once with your final output. Do not include any other commentary.`;

function toDataBlock(label, obj) {
  return `${label}:\n${JSON.stringify(obj, null, 2)}`;
}

function toToolSchema(zodSchema) {
  // zodToJsonSchema wraps everything in $ref/$defs by default; target: "openApi3"
  // gives a flat inline schema, which is what the Messages API expects for
  // a tool's input_schema.
  return zodToJsonSchema(zodSchema, { target: "openApi3" });
}

async function callStructured({ system, userContent, toolName, toolDescription, zodSchema }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userContent }],
    tools: [
      {
        name: toolName,
        description: toolDescription,
        input_schema: toToolSchema(zodSchema),
      },
    ],
    tool_choice: { type: "tool", name: toolName },
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === toolName,
  );
  if (!toolUse) {
    throw new Error(`Expected a ${toolName} tool call in the response but got none`);
  }

  // Throws a descriptive ZodError if Claude's output doesn't match the
  // schema — surfaced to the caller as a 502 rather than silently trusted.
  return zodSchema.parse(toolUse.input);
}

/**
 * Wraps callStructured with the code-level leak guard (leakGuard.js): after
 * a successful, schema-valid call, every candidate-facing string in the
 * result is checked for digits or internal field names. On a hit, retries
 * once with a corrective reminder appended to the prompt. If the second
 * attempt also leaks, throws LeakGuardError rather than ever returning
 * unsafe text to a caller — callers decide what "fail safely" means for
 * their situation (see generateQuestions and deliverInterviewTurn below).
 */
async function callStructuredWithLeakGuard({
  system,
  userContent,
  toolName,
  toolDescription,
  zodSchema,
  candidate,
  extractCandidateFacingStrings,
}) {
  const attemptLog = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const content =
      attempt === 1
        ? userContent
        : `${userContent}\n\nIMPORTANT: your previous attempt included a number, score, or internal field name in candidate-facing text, which is never allowed. Re-read the rules above carefully and try again — remove every digit and every internal field/system name from any candidate-facing text.`;

    const result = await callStructured({ system, userContent: content, toolName, toolDescription, zodSchema });
    const leaks = extractCandidateFacingStrings(result).flatMap((text) =>
      findLeaks(text, candidate).map((leak) => ({ ...leak, text })),
    );

    if (leaks.length === 0) return result;
    attemptLog.push({ attempt, leaks });
  }

  throw new LeakGuardError(
    `Candidate-facing text failed the internal leak guard on both attempts for "${toolName}".`,
    { leaks: attemptLog, toolName },
  );
}

/**
 * Step 1 — question generation.
 * @param {object} candidate candidate object from the mock dataset
 * @param {object} role role object from the mock dataset
 */
export async function generateQuestions(candidate, role) {
  const userContent = [
    toDataBlock("Role blueprint", role),
    toDataBlock("Candidate assessment profile", candidate),
    "Generate the interview question set for this candidate now.",
  ].join("\n\n");

  try {
    return await callStructuredWithLeakGuard({
      system: QUESTION_GEN_SYSTEM_PROMPT,
      userContent,
      toolName: "submit_questions",
      toolDescription: "Submit the generated set of 3-5 structured pre-screen interview questions.",
      zodSchema: QuestionSetSchema,
      candidate,
      extractCandidateFacingStrings: (result) => result.questions.map((q) => q.candidate_facing_question),
    });
  } catch (err) {
    if (err instanceof LeakGuardError) {
      // This happens before the candidate has seen anything (question
      // generation runs when a recruiter clicks "Start Pre-Screen", ahead
      // of the chat UI), so there's no live conversation to protect — a
      // clear, retryable failure here is fine. What must never happen is
      // leaking the actual offending text/field names into the HTTP
      // response, so the detailed leak info goes to the server log only.
      console.error(
        `[leak-guard] question generation failed twice for candidate ${candidate.candidate_id}:`,
        JSON.stringify(err.leaks, null, 2),
      );
      throw new Error(
        "Could not generate a safe, candidate-appropriate question set for this candidate after two attempts. Please try again.",
      );
    }
    throw err;
  }
}

/**
 * Step 2 — one interview turn's candidate-facing message. Code (see
 * interviewFlow.js) decides `directive`: which fixed question comes next,
 * or that it's time to wrap up. This call never receives the candidate's
 * assessment data — it only needs the transcript and the directive, so
 * there's no assessment data in its prompt to leak in the first place.
 *
 * Throws LeakGuardError if both attempts leak — interviewFlow.js is
 * responsible for catching that and substituting the pre-written safe
 * fallback so a live candidate is never shown a raw error or broken text.
 *
 * @param {object} role role object from the mock dataset
 * @param {Array} transcript transcript so far, [{ speaker, message }, ...]
 * @param {{ type: 'ask_question', question: object } | { type: 'wrap_up' }} directive
 * @param {object} candidate only used locally for the leak guard's field-name denylist, never sent to the model
 */
export async function deliverInterviewTurn({ role, transcript, directive, candidate }) {
  const directiveText =
    directive.type === "ask_question"
      ? `Next required content: ask about this topic next (you may phrase it naturally, but you must cover this and only this topic): "${directive.question.candidate_facing_question}"`
      : "Next required content: wrap up. This was the last topic — deliver a short, warm closing message thanking the candidate and letting them know a recruiter will follow up with next steps. Do not ask anything further.";

  const userContent = [
    toDataBlock("Role", { title: role.title }),
    toDataBlock(
      "Conversation so far",
      transcript.map(({ speaker, message }) => ({ speaker, message })),
    ),
    directiveText,
  ].join("\n\n");

  try {
    const result = await callStructuredWithLeakGuard({
      system: INTERVIEW_TURN_SYSTEM_PROMPT,
      userContent,
      toolName: "submit_turn",
      toolDescription: "Submit this turn's candidate-facing message.",
      zodSchema: InterviewTurnSchema,
      candidate,
      extractCandidateFacingStrings: (result) => [result.candidate_facing_message],
    });
    return result.candidate_facing_message;
  } catch (err) {
    if (err instanceof LeakGuardError) {
      // Loud in the log, never loud (or broken) in the candidate's chat —
      // interviewFlow.js catches this and substitutes a pre-written safe
      // message so the conversation continues cleanly.
      console.error(
        `[leak-guard] interview turn delivery failed twice for candidate ${candidate.candidate_id} — falling back to a pre-written safe message. Review this candidate's interview.`,
        JSON.stringify({ directive, leaks: err.leaks }, null, 2),
      );
    }
    throw err;
  }
}

/**
 * Step 3 — grading.
 * @param {object} candidate candidate object from the mock dataset
 * @param {object} role role object from the mock dataset
 * @param {Array} questions the question set generated in Step 1
 * @param {Array} transcript full chat transcript, [{ turn, speaker, message, questionId, practice }]
 */
export async function gradeInterview(candidate, role, questions, transcript) {
  const userContent = [
    toDataBlock("Role blueprint", role),
    toDataBlock("Candidate assessment profile", candidate),
    toDataBlock("Interview questions asked (with rationale)", questions),
    toDataBlock("Full interview transcript", transcript),
    "Grade this interview now.",
  ].join("\n\n");

  return callStructured({
    system: GRADING_SYSTEM_PROMPT,
    userContent,
    toolName: "submit_grading",
    toolDescription: "Submit the structured grading result for this interview.",
    zodSchema: GradingResultSchema,
  });
}
