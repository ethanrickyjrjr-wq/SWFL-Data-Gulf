// GET /api/connect/skill — public, serves the intake skill markdown from the
// same deploy as the endpoints it documents (drift-proof by construction).
import { SKILL_MD } from "@/lib/connect/skill-content";

export const runtime = "nodejs";

export async function GET() {
  return new Response(SKILL_MD, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
