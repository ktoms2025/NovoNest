# AI Pre-Screen Interview Tool — Claude Code Build Spec

**Prototype spec, not a committed product requirement.** Working title used internally: "Linea Interview" (named but unconfirmed in final eSkill Product Strategy v2.1, flagged there as needing market research and customer validation before roadmap confirmation).

Prepared for: Kristin Toms, VP Product Strategy
Purpose: build a clickable/functional prototype in Claude Code to test the concept before any real scoping decision.

## 1. What this tool does

Takes a candidate's completed assessment data (hard skills, personality/RIASEC, AI Sample simulation results, blueprint coverage) and:

1. Generates a custom, structured pre-screen interview tied to that candidate's specific score profile, not a generic script
2. Conducts the interview via an AI Recruiter (voice, using ElevenLabs; chat as fallback/text mode)
3. Grades the interview against a rubric, consistent with how AI Sample scoring works
4. Produces a single report for the recruiter, before any human ever speaks to the applicant, with a recommendation: Progress to human interview / Waitlist / Reject

The goal is a recruiter opens one report and has a full picture, with reasoning, before their first live conversation with the candidate.

## 2. Inputs the tool consumes

**[SOURCED — project assessment structure]** these are the real data types already defined elsewhere in eSkill's product docs:

- Hard skills assessment scores (existing capability)
- Personality & Vocational Interest results: Big Five, Integrity, Impression Management, RIASEC top codes (Behavioral Assessment rebuild, PRD v7)
- AI Sample (Linea Sample) simulation scores and transcript, once that ships
- Role Blueprint coverage: which of the six core dimensions (Skills, Behavioral, Personality, Cognitive, Aptitude, Trainability) are assessed vs. gapped for this role

For the prototype: none of this needs a live eSkill API connection. Use a mock/synthetic candidate dataset (JSON) shaped like the above, so the tool can be built and demoed without depending on real system access.

### 2.1 Sample mock candidate dataset (fictional, for prototype use only)

All names, scores, and transcript content are fabricated for this prototype. None of it represents a real candidate or real eSkill assessment output. Shape and field names follow the structure already established in the Behavioral Assessment PRD (Big Five, Integrity, Impression Management, RIASEC) and the AI Sample MVP scoring approach (per-scenario rubric scores), so swapping in real data later should be a drop-in replacement rather than a rebuild.

See `server/data/mock-candidates.json` for the full dataset (role definition + 4 fictional candidates: C-1001 Jordan Ellis, C-1002 Taylor Brooks, C-1003 Morgan Reyes, C-1004 Casey Nguyen).

Suggested use in Claude Code: save this as `mock-candidates.json` and have the question-generation step (Section 3, Step 1) read a single candidate object from it as its input, rather than hardcoding values into the prompt. That keeps the data swappable later without touching the generation logic.

## 3. Core workflow

### Step 1 — Question generation

Given a candidate's score profile and the role's blueprint, generate 3–5 structured interview questions. Each question should:

- Target a specific score, gap, or flag (not generic small talk)
- State its rationale in plain language, tied back to the specific input that triggered it (this is what makes the report explainable to a recruiter later)
- Stay within a fixed rubric structure, not open-ended prompting, so the same input profile produces a consistent question set

This is an LLM call: assessment data in, structured question set + rationale out. Constrain the output format (e.g., strict JSON) so the report step can consume it reliably.

### Step 2 — Interview delivery (AI Recruiter)

- Voice-based interaction using ElevenLabs Conversational AI (agent handles turn-taking, speech-to-text, text-to-speech)
- Chat-based fallback mode for candidates without mic access or by candidate preference
- Practice/intro turn before scored questions begin, so the candidate understands the format (this mirrors a real requirement already in eSkill's AI Simulations MVP doc for a comparable reason)
- Full transcript logged (required for scoring, review, and any future audit needs)

### Step 3 — Grading

- Score each response against the rubric dimension tied to its originating question
- Output structured, explainable scores per dimension, not just a raw pass/fail
- Flag any response that seems inconsistent with the candidate's existing assessment scores (this "consistency check" is itself a useful recruiter signal, e.g., candidate claims strong process discipline verbally but scored low on data entry accuracy)

### Step 4 — Report generation

Single-page report for the recruiter containing:

- Candidate snapshot: role applied for, assessment scores summary, blueprint coverage
- The interview questions asked and why
- Scored responses per dimension
- Consistency flags (if any)
- A recommendation: Progress to human interview / Waitlist / Reject, with a short plain-language reasoning paragraph
- Full transcript, available but not front-and-center

## 4. Suggested tech stack for the Claude Code prototype

- **Frontend:** simple React app (or plain HTML/JS to start, matching the existing POC's approach) — candidate list, "start pre-screen" trigger, live interview view, report view
- **Voice:** ElevenLabs Conversational AI agent for the voice interview turn-taking, speech-to-text, and text-to-speech
- **LLM (question generation + grading):** Claude, via the Anthropic API, for both the question-generation step and the rubric-grading step. Keep these as two distinct calls with strict structured (JSON) output rather than one freeform call, so each step's output can be validated and reused
- **Data:** mock candidate JSON files standing in for real assessment data; no live eSkill or ATS connection in the prototype
- **Storage:** transcripts and reports can be stored in-memory or as local JSON for the prototype; no persistent database needed to prove the concept

## 5. Explicitly out of scope for the prototype

- Any real connection to eSkill's assessment platform, ATS, or Kombo integration
- Cross-candidate ranking or comparison (per the AI Simulations MVP doc, this is explicitly excluded from that product's MVP scope too, and the same caution applies here)
- Real candidate data of any kind
- Final legal/disclosure language — use clearly-labeled placeholder disclosure text only
- Production authentication, data retention policy, or compliance controls

## 6. Open questions this prototype does not resolve

**[GAP]** carried over from related, already-flagged open items in eSkill's AI Simulations MVP requirements, since the same problems apply here:

- Who owns rubric design and approval for this interview type, and what dimensions must every rubric cover?
- What AI disclosure language is required before a candidate can be told "you are speaking with an AI Recruiter," and has Legal reviewed it? (Relevant given eSkill's current legal counsel is litigation-focused, not employment-law-specialized)
- What is the acceptable scoring variance across repeated runs of the same transcript, given LLM non-determinism? This was flagged as a hard launch gate for AI Sample and would need the same treatment here
- Voice partner selection for AI Sample itself is still an open item internally; using ElevenLabs for this separate prototype is your own choice for this tool and does not resolve or presume that decision for Linea Sample
- Data retention period for interview transcripts and, if recorded, voice audio
- Whether "consistency flags" (interview response vs. assessment score mismatch) could function as unintended adverse impact signal, and how that should be reviewed

None of these block building a prototype. They would need answers before any real candidate ever went through this flow.

## 7. Suggested build phases

**Phase 1 — Core loop, text only.** Mock candidate data → question generation → chat-based interview (no voice yet) → grading → report screen. Prove the report is genuinely useful before adding voice complexity.

**Phase 2 — Add voice.** Layer in ElevenLabs for the interview delivery step. Keep chat as a fallback path.

**Phase 3 — Connect to the existing POC concept.** Wire the report's recommendation into the same Progress/Waitlist/Reject action pattern already mocked up in the Candidate 360 and Compare Candidates POC screens, so the two prototypes tell one coherent story when shown together.
