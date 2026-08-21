// Structured-output schemas for the two LLM calls (Section 3, Steps 1 & 3
// of the spec). Kept as strict Zod schemas so client.messages.parse() can
// validate the model's JSON output before anything downstream trusts it.
import { z } from "zod";

export const DIMENSIONS = [
  "Skills",
  "Behavioral",
  "Personality",
  "Cognitive",
  "Trainability",
];

// --- Step 1: question generation -------------------------------------

export const QuestionSchema = z.object({
  id: z.string().describe("Short stable id, e.g. 'q1'"),
  dimension: z.enum(DIMENSIONS),
  candidate_facing_question: z
    .string()
    .describe(
      "The natural, conversational question exactly as the candidate will see it. Must contain no numbers, scores, or internal field/system names of any kind — see system prompt rules.",
    ),
  internal_rationale: z
    .string()
    .describe(
      "Plain-language explanation of why this question was generated, tied back to the specific input score/flag that triggered it. Recruiter-report only — the candidate never sees this.",
    ),
  source_signal: z
    .string()
    .describe(
      "The specific field/value from the candidate's assessment data that triggered this question, e.g. 'troubleshooting_logic: 69' or 'blueprint_coverage.Cognitive: not_assessed'. Recruiter-report only.",
    ),
});

export const QuestionSetSchema = z.object({
  questions: z.array(QuestionSchema).min(3).max(5),
});

// --- Step 2: interview turn delivery ------------------------------------
// One call per chat turn during the live interview. The caller (code, not
// the model) decides which fixed question comes next or that it's time to
// wrap up — this call's only job is phrasing that turn naturally, so its
// output is intentionally just the one candidate-facing string.

export const InterviewTurnSchema = z.object({
  candidate_facing_message: z
    .string()
    .min(1)
    .describe(
      "This turn's full message to the candidate: a brief natural acknowledgment of what they just said, then the required next content (a question or the closing message). No numbers, no internal field/system names, no scoring language.",
    ),
});

// --- Step 3: grading ----------------------------------------------------

export const DimensionScoreSchema = z.object({
  question_id: z.string(),
  dimension: z.enum(DIMENSIONS),
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("0-100, same scale as the existing assessment scores"),
  explanation: z
    .string()
    .describe("Plain-language explanation of the score, referencing the candidate's actual response"),
});

export const ConsistencyFlagSchema = z.object({
  question_id: z.string(),
  description: z
    .string()
    .describe(
      "Plain-language description of the inconsistency between the interview response and an existing assessment score",
    ),
  related_assessment_field: z
    .string()
    .describe("The existing assessment field this conflicts with, e.g. 'hard_skills.data_entry_accuracy'"),
  severity: z.enum(["low", "medium", "high"]),
});

export const GradingResultSchema = z.object({
  dimension_scores: z.array(DimensionScoreSchema),
  consistency_flags: z.array(ConsistencyFlagSchema),
  overall_summary: z.string().describe("2-3 sentence plain-language summary of interview performance"),
  recommendation: z.enum(["Progress", "Waitlist", "Reject"]),
  recommendation_reasoning: z
    .string()
    .describe("Short plain-language paragraph justifying the recommendation, for the recruiter report"),
});
