// Prototype storage: sessions (in-progress interviews) and reports, as
// local JSON files. Per the spec, no persistent database is needed to
// prove the concept — this is intentionally the simplest thing that works.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = join(__dirname, "..", "data", "sessions");
const REPORTS_DIR = join(__dirname, "..", "data", "reports");

for (const dir of [SESSIONS_DIR, REPORTS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sessionPath(id) {
  return join(SESSIONS_DIR, `${id}.json`);
}

function reportPath(id) {
  return join(REPORTS_DIR, `${id}.json`);
}

export function saveSession(session) {
  writeFileSync(sessionPath(session.sessionId), JSON.stringify(session, null, 2));
  return session;
}

export function getSession(sessionId) {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function saveReport(report) {
  writeFileSync(reportPath(report.sessionId), JSON.stringify(report, null, 2));
  return report;
}

export function getReport(sessionId) {
  const path = reportPath(sessionId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}
