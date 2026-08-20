import "dotenv/config";
import express from "express";
import cors from "cors";
import { candidatesRouter } from "./routes/candidates.js";
import { interviewsRouter } from "./routes/interviews.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/candidates", candidatesRouter);
app.use("/api/interviews", interviewsRouter);

const PORT = process.env.PORT || 8787;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "WARNING: ANTHROPIC_API_KEY is not set. Question generation and grading calls will fail until it is configured (see server/.env.example).",
  );
}

app.listen(PORT, () => {
  console.log(`Pre-screen interview API listening on http://localhost:${PORT}`);
});
