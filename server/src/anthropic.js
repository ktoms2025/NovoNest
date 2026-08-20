// Two distinct, structured-output Anthropic API calls (per the spec's
// explicit instruction: question generation and grading are separate calls,
// not one combined freeform call). Both force a single tool call whose
// input_schema is generated from the Zod schemas in schemas.js, then
// validate the returned tool input with that same Zod schema — so the
// response is always either valid structured data or a thrown error, never
// freeform text.
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
// different dataset requires no changes here.
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { QuestionSetSchema, GradingResultSchema } from "./schemas.js";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

const QUESTION_GEN_SYSTEM_PROMPT = `You are the question-design component of an AI pre-screen interview tool used in a hiring pipeline. Given one candidate's completed assessment data and the role's blueprint coverage requirements, you generate a short, structured set of pre-screen interview questions for that candidate.

Rules:
- Generate between 3 and 5 questions total.
- Every question must target a specific score, gap, or flag found in the candidate's assessment data (a notably low or high hard-skill score, a personality trait extreme, an AI Sample scenario result, or a blueprint dimension marked "not_assessed" or "partial"). Do not include generic small talk, icebreakers, or questions with no basis in the data.
- Every question must have a plain-language rationale that explicitly names the specific field and value that triggered it, so a recruiter reading the report later can see exactly why the question exists.
- Prioritize, in order: (1) blueprint dimensions marked "not_assessed" or "partial" for this role, (2) notably low or notably high hard-skill or AI Sample scores, (3) personality or integrity signals worth probing further.
- Where the data supports it, cover a mix of the five blueprint dimensions rather than clustering all questions on one dimension.
- Keep each question concise (1-3 sentences) and answerable in a short chat response.
- Do not invent facts about the candidate beyond what is in the provided data.
- Call the submit_questions tool exactly once with your final output. Do not include any other commentary.`;

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

  return callStructured({
    system: QUESTION_GEN_SYSTEM_PROMPT,
    userContent,
    toolName: "submit_questions",
    toolDescription: "Submit the generated set of 3-5 structured pre-screen interview questions.",
    zodSchema: QuestionSetSchema,
  });
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
