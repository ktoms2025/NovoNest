import { Router } from "express";
import { getCandidate, getRole, listCandidates } from "../data.js";

export const candidatesRouter = Router();

candidatesRouter.get("/", (req, res) => {
  res.json({ role: getRole(), candidates: listCandidates() });
});

candidatesRouter.get("/:candidateId", (req, res) => {
  const candidate = getCandidate(req.params.candidateId);
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  res.json({ role: getRole(), candidate });
});
