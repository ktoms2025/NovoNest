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
│       ├── schemas.js                       Zod schemas for both LLM calls' structured output
│       ├── anthropic.js                     the two Claude API calls (question gen, grading)
│       ├── interviewFlow.js                 scripted chat delivery state machine (intro/practice → Q&A)
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

**The two LLM calls are separate, per the spec's explicit instruction:**
`generateQuestions()` and `gradeInterview()` in `server/src/anthropic.js`
are independent Anthropic API calls, each forcing a single structured
tool call (JSON Schema generated from the same Zod schema used to validate
the response) — never one combined freeform call.

**Candidate data is swappable, not hardcoded into prompts:** both LLM
calls take the candidate/role objects as data (serialized JSON blocks in
the request), never interpolated into prompt prose. Swapping
`server/data/mock-candidates.json` for a different (still mock/fictional)
dataset — or pointing `MOCK_DATA_PATH` at another file — requires no
prompt or code changes.

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
   tied to that candidate's specific score profile, then walks through a
   practice turn and the questions as a chat. Type a response for each
   turn as if you were the candidate.
3. **Report** — after the last question, click "Generate Report". This
   triggers the second Claude call (grading), which scores each response,
   checks for consistency flags against the candidate's existing
   assessment data, and produces a Progress / Waitlist / Reject
   recommendation with reasoning.

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

- **Model:** defaults to `claude-opus-5` for both calls, overridable via
  `ANTHROPIC_MODEL` in `server/.env`.
- **Structured output mechanism:** forced tool use (`tool_choice`) with a
  JSON Schema generated from each Zod schema, rather than the newer
  `messages.parse()` / `output_config.format` API — the installed
  `@anthropic-ai/sdk` version doesn't expose that yet.
- **Storage:** sessions and reports are local JSON files under
  `server/data/{sessions,reports}/`, gitignored — matches the spec's "no
  persistent database needed to prove the concept."
- **Chat delivery is scripted, not an LLM call:** Section 3 Step 2
  describes the AI Recruiter's turn-taking mechanics, but the actual
  question content was already generated in Step 1, so presenting the
  intro/practice turn and each question in order doesn't need its own
  Claude call — only Steps 1 and 3 hit the API. Worth revisiting if
  Phase 2 voice needs dynamic follow-up questions.

## What's out of scope here (per spec Section 5)

No real eSkill/ATS connection, no cross-candidate ranking, no real
candidate data, no reviewed legal/disclosure language (the interview's
AI-disclosure text is explicitly placeholder — see `interviewFlow.js`),
no production auth/retention/compliance controls.
