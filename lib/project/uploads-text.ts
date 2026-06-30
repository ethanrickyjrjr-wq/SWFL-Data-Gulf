// lib/project/uploads-text.ts
//
// Server loader: the text of a project's uploaded files (and notes), so the social
// AUTHOR can weigh the user's own documents as an EQUAL source beside the lake feed
// and the live-web refresh. Each `kind:"file"` item carries `extracted_text`
// (Claude-vision-distilled at upload, schema in lib/project/items.ts); `kind:"note"`
// carries free text.
//
// A cookie-authed, RLS-scoped, fail-open read (own project only; anon / any miss → "").
// Mirrors the private helper in lib/assistant/conversation-path.ts — the build is NEVER
// blocked on this read (RULE 0.7). Server-only (uses next/headers cookies()).
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { ProjectItem } from "@/lib/project/items";

export async function loadProjectUploadsText(projectId: string): Promise<string> {
  if (!projectId) return "";
  try {
    const supabase = createClient(await cookies());
    const { data } = await supabase
      .from("projects")
      .select("items")
      .eq("id", projectId)
      .maybeSingle();
    const items = (data?.items ?? []) as ProjectItem[];
    const parts: string[] = [];
    for (const it of items) {
      if (it.kind === "file" && typeof it.extracted_text === "string" && it.extracted_text.trim()) {
        const name = it.caption || it.storage_path?.split("/").pop() || "upload";
        parts.push(`DOCUMENT "${name}":\n${it.extracted_text.trim()}`);
      } else if (it.kind === "note" && typeof it.text === "string" && it.text.trim()) {
        parts.push(`NOTE: ${it.text.trim()}`);
      }
    }
    return parts.join("\n\n");
  } catch {
    return "";
  }
}
