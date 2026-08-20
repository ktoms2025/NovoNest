// Loads the mock candidate dataset. The path is configurable via
// MOCK_DATA_PATH so a different (still mock) dataset can be swapped in
// without touching any code — including the LLM prompts, which never
// hardcode candidate values.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(__dirname, "..", "data", "mock-candidates.json");

let cache = null;

function load() {
  if (cache) return cache;
  const path = process.env.MOCK_DATA_PATH
    ? resolve(process.env.MOCK_DATA_PATH)
    : DEFAULT_PATH;
  const raw = readFileSync(path, "utf-8");
  cache = JSON.parse(raw);
  return cache;
}

export function getRole() {
  return load().role;
}

export function listCandidates() {
  return load().candidates.map((c) => ({
    candidate_id: c.candidate_id,
    name: c.name,
    applied_date: c.applied_date,
  }));
}

export function getCandidate(candidateId) {
  return load().candidates.find((c) => c.candidate_id === candidateId) || null;
}
