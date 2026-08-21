// Deterministic, code-level backstop against internal assessment data
// leaking into candidate-facing text (spec v2, Section 3 Steps 1 & 2 —
// live testing of Phase 1 showed the model surfacing raw scores and field
// names directly to the candidate). This runs on every string the
// candidate will actually see, in addition to — never instead of — the
// prompt instructions telling the model not to do this.
//
// Two checks, both cheap and deliberately low-false-positive:
//  1. No digits at all. Every real leak seen in testing was a raw score;
//     legitimate candidate-facing interview copy has no legitimate reason
//     to contain a number.
//  2. No verbatim internal field names. Collected dynamically from the
//     candidate object's own keys (any key containing an underscore, which
//     is how every internal field in this dataset shape is named — e.g.
//     "troubleshooting_logic", "impression_management"), so this keeps
//     working correctly if the mock dataset is swapped for a different one
//     with different field names, with no code changes.

export class LeakGuardError extends Error {
  constructor(message, { leaks, toolName }) {
    super(message);
    this.name = "LeakGuardError";
    this.leaks = leaks;
    this.toolName = toolName;
  }
}

function collectSnakeCaseFieldNames(value, acc = new Set()) {
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (key.includes("_")) acc.add(key);
      collectSnakeCaseFieldNames(nested, acc);
    }
  }
  return acc;
}

/**
 * @param {string} text a single candidate-facing string to check
 * @param {object} candidate the candidate object whose field names must never leak
 * @returns {Array<{type: string, detail: string}>} empty if clean
 */
export function findLeaks(text, candidate) {
  const leaks = [];
  if (/\d/.test(text)) {
    leaks.push({ type: "digit", detail: "contains a digit" });
  }
  for (const fieldName of collectSnakeCaseFieldNames(candidate)) {
    if (text.toLowerCase().includes(fieldName.toLowerCase())) {
      leaks.push({ type: "field_name", detail: fieldName });
    }
  }
  return leaks;
}
