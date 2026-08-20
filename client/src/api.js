async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const message = body?.detail || body?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export const api = {
  getCandidates: () => request("/candidates"),
  getCandidate: (candidateId) => request(`/candidates/${candidateId}`),
  startInterview: (candidateId) =>
    request("/interviews", { method: "POST", body: JSON.stringify({ candidateId }) }),
  respond: (sessionId, message) =>
    request(`/interviews/${sessionId}/respond`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  completeInterview: (sessionId) =>
    request(`/interviews/${sessionId}/complete`, { method: "POST" }),
  getReport: (sessionId) => request(`/interviews/${sessionId}/report`),
};
