# AI Pre-Screen Interview Tool — Prototype (Phase 1)

Clickable/functional prototype of the "Linea Interview" concept. Full spec:
[`docs/AI_PreScreen_Interview_Claude_Code_Spec.md`](docs/AI_PreScreen_Interview_Claude_Code_Spec.md).

**Phase 1 only, per the spec's build order:** mock candidate data → question
generation → chat-based interview (text only, no voice) → grading → report
screen. Voice (ElevenLabs) is intentionally not built yet — see Section 7
of the spec for Phase 2/3.

## Architecture

```
├── docs/                                    spec (source of truth)
├── server/                                  Express API
│   ├── data/mock-candidates.json            swappable mock dataset (Section 2.1 of spec)
│   └── src/
│       ├── data.js                          loads/serves the mock dataset
│       ├── schemas.js                       Zod schemas for all three LLM calls' structured output
│       ├── leakGuard.js                     code-level backstop: no digits/internal field names in candidate-facing text
│       ├── anthropic.js                     the three Claude API calls (question gen, turn delivery, grading)
│       ├── interviewFlow.js                 chat delivery state machine (fixed question sequence; wording is LLM-generated per turn)
│       ├── store.js                         local-JSON session/report storage
│       └── routes/                          candidates + interviews REST endpoints
└── client/                                  React + Vite frontend
    └── src/pages/
        ├── CandidateListPage.jsx            role + candidate list, "Start Pre-Screen"
        ├── InterviewPage.jsx                chat-based interview UI
        └── ReportPage.jsx                   single-page recruiter report
```

**Why a backend at all, for a prototype:** the Anthropic API key can't be
called directly from the browser without exposing it to anyone who opens
dev tools. The Express server holds the key and makes both LLM calls;
the React app only ever talks to `/api/*`.

**Question generation and grading are separate calls, per the spec's
explicit instruction:** `generateQuestions()` and `gradeInterview()` in
`server/src/anthropic.js` are independent Anthropic API calls, never one
combined freeform call. Each forces a single structured tool call (JSON
Schema generated from the same Zod schema used to validate the response).

**Interview delivery (`deliverInterviewTurn()`) is a third, separate call,
made once per chat turn** — added in spec v2 so the AI Recruiter can
naturally acknowledge what the candidate just said instead of reading a
scripted "Question X of Y." Code in `interviewFlow.js` still decides
*what* gets asked and *when* (the same fixed 3–5 questions from Step 1, in
order, then a close) — the model's only job each turn is phrasing that
naturally. This keeps grading/report-explainability deterministic while
letting the conversational tone be real.

**Candidate data is swappable, not hardcoded into prompts:** all three LLM
calls take the candidate/role objects as data (serialized JSON blocks in
the request), never interpolated into prompt prose — and the turn-delivery
call doesn't receive the candidate's assessment data at all, since it has
no need for it. Swapping `server/data/mock-candidates.json` for a
different (still mock/fictional) dataset — or pointing `MOCK_DATA_PATH` at
another file — requires no prompt or code changes.

**Leak guard (`leakGuard.js`):** every candidate-facing string (each
question, each turn's message) is checked in code before it can reach the
UI — reject if it contains any digit, or any of the candidate's actual
internal field names (collected dynamically from the dataset, e.g.
`troubleshooting_logic`). One retry with a corrective reminder if it trips;
if both attempts fail:
- **Step 1 (question generation)** — this runs before any candidate has
  seen anything (triggered by "Start Pre-Screen"), so it just fails
  cleanly back to whoever started it, with the actual leaked text/field
  names logged server-side only, never in the HTTP response.
- **Step 2 (a live turn)** — the candidate is mid-conversation, so it can
  never surface a raw error or broken message. `interviewFlow.js` catches
  this (and any other unexpected error during turn delivery) and
  substitutes pre-written, non-LLM-generated fallback text: a generic
  acknowledgment plus the already-guard-clean question text from Step 1,
  or a static closing message. The interview continues without the
  candidate ever seeing anything wrong; the failure is logged loudly to
  the server console for review, and the affected transcript turn is
  marked `usedFallback: true` internally. "Fail loudly" means loud in the
  log, never loud in the candidate's chat.

This regex-style guard catches literal leaks (a raw score, a raw field
name) — it can't catch a semantic paraphrase that avoids both (e.g. "your
accuracy was a bit low"). The prompt rules are the primary defense there;
reading actual transcripts is still worth doing, not just trusting the
guard.

## Setup

Requires Node 18+.

```bash
npm run install:all        # installs server + client deps

cp server/.env.example server/.env
# then edit server/.env and set ANTHROPIC_API_KEY
```

Get an API key at https://console.anthropic.com/. Keep it out of chat
history and version control — `server/.env` is gitignored.

## Run

```bash
npm run dev                # runs server (:8787) and client (:5173) together
```

Then open http://localhost:5173.

(Or run them separately: `npm run dev --prefix server` and
`npm run dev --prefix client`.)

## Using it

1. **Candidate list** — pick one of the four fictional candidates.
2. **Interview** — the app calls Claude once to generate 3–5 questions
   tied to that candidate's specific score profile, then conducts the
   chat conversationally: a warm opening turn, then each question
   delivered with a natural acknowledgment of your previous answer, then a
   warm close — no "Question X of Y," no visible scoring language. Type a
   response for each turn as if you were the candidate.
3. **Report** — after the closing turn, click "Generate Report". This
   triggers the grading call, which scores each response, checks for
   consistency flags against the candidate's existing assessment data, and
   produces a Progress / Waitlist / Reject recommendation with reasoning.

## Notes on decisions made while building this

The spec explicitly left two things open; both were confirmed with the
requester before building:

- **Frontend stack:** React + Vite (the spec offered React or plain
  HTML/JS "matching the existing POC's approach," which wasn't available
  to check against in this environment).
- **Recommendation logic:** the grading LLM call reasons holistically over
  rubric scores, consistency flags, and the candidate's existing
  assessment data to produce the recommendation — no hardcoded numeric
  score cutoffs, since the spec doesn't define any and none would be
  well-justified without input from whoever ends up owning rubric design
  (see Section 6 of the spec).

A few smaller implementation defaults, not called out in the spec:

- **Model:** defaults to `claude-sonnet-5` for both calls, overridable via
  `ANTHROPIC_MODEL` in `server/.env`.
- **Structured output mechanism:** forced tool use (`tool_choice`) with a
  JSON Schema generated from each Zod schema, rather than the newer
  `messages.parse()` / `output_config.format` API — the installed
  `@anthropic-ai/sdk` version doesn't expose that yet.
- **Storage:** sessions and reports are local JSON files under
  `server/data/{sessions,reports}/`, gitignored — matches the spec's "no
  persistent database needed to prove the concept."
- **Only the opening turn is scripted, not an LLM call:** there's no prior
  candidate answer to react to yet, so nothing about it needs to vary —
  every other turn (each question's delivery, the close) is one Claude
  call, per the v2 spec's conversational requirements.

## What's out of scope here (per spec Section 5)

No real eSkill/ATS connection, no cross-candidate ranking, no real
candidate data, no reviewed legal/disclosure language (the interview's
AI-disclosure text is explicitly placeholder — see `interviewFlow.js`),
no production auth/retention/compliance controls.
