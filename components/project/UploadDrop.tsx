"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { createClient } from "@/utils/supabase/client";
import type { ProjectItem } from "@/lib/project/items";
import { UPLOADS_BUCKET } from "@/lib/project/signed-upload-url";
import { censusCsv } from "@/lib/listings-user/csv-census";

// Page-1 capture runs only in the browser (canvas/pdf.js) → ssr:false, lazy.
const PdfCapture = dynamic(() => import("@/lib/pdf/PdfCapture").then((m) => m.PdfCapture), {
  ssr: false,
});

/** A filed file item plus a local object-URL preview for instant in-session render. */
type FileItem = Extract<ProjectItem, { kind: "file" }>;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MiB — mirrors the bucket file_size_limit
const MAX_FILES = 10; // per project

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || /\.hei[cf]$/i.test(file.name);
}

/** CSVs report as text/csv, application/csv, or (Windows/Excel) vnd.ms-excel —
 *  require the .csv extension so real .xls files don't slip in. */
function isCsv(file: File): boolean {
  return /\.csv$/i.test(file.name);
}

interface Props {
  projectId: string;
  /** Current count of `{kind:"file"}` items — gates the 10/project limit. */
  fileCount: number;
  /** Called after a successful upload + filing; parent appends + persists. */
  onUploaded: (item: FileItem, objectUrl: string) => void;
  /** Called after a PDF's extraction settles (done or failed) so the parent can
   *  re-fetch items to reflect the new `extraction_status`. Optional — the build
   *  path reads `extracted_text` straight from the DB regardless. */
  onExtractionComplete?: () => void;
}

export function UploadDrop({ projectId, fileCount, onUploaded, onExtractionComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [reading, setReading] = useState(false);
  // Mounted off-screen PdfCapture instances awaiting their page-1 PNG export.
  const [captures, setCaptures] = useState<{ id: string; url: string }[]>([]);
  // Outcome line for the CSV file door (import counts / parked notice).
  const [csvNote, setCsvNote] = useState<string | null>(null);

  /** CSV file door: census the headers, route to the matching shape endpoint,
   *  or park with the census recorded (spec 2026-08-03 §4). */
  async function handleCsv(file: File) {
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setNeedsLogin(true);
        return;
      }
      const text = await file.text();
      const census = censusCsv(text);

      if (census.matchedShape === "listings") {
        // The endpoint is the flow: import now, show the read-back counts.
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch("/api/listings/import", { method: "POST", body: fd });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body) {
          setError(body?.error ?? "Listings import failed.");
          return;
        }
        setCsvNote(
          `Listings imported: ${body.added} of ${body.total} landed` +
            (body.matched_to_county
              ? `, ${body.matched_to_county} matched to county records`
              : "") +
            (body.skipped ? `, ${body.skipped} skipped` : "") +
            ".",
        );
        return;
      }

      if (census.matchedShape === "contacts") {
        setCsvNote("This looks like a contacts list — import it on the Contacts page.");
        return;
      }

      // No shape → PARK: store the file + census on the item, badge it, and
      // open the shape-demand check. Nothing a user hands us silently vanishes.
      const path = `${user.id}/${projectId}/${crypto.randomUUID()}.csv`;
      const { error: upErr } = await supabase.storage
        .from(UPLOADS_BUCKET)
        .upload(path, file, { contentType: "text/csv", upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      const item: FileItem = {
        id: crypto.randomUUID(),
        added_at: new Date().toISOString(),
        origin: "web",
        kind: "file",
        storage_path: path,
        mime: "text/csv",
        size: file.size,
        csv_headers: census.headers,
        csv_row_count: census.rowCount,
        parked: true,
        ...(caption.trim() ? { caption: caption.trim() } : {}),
      };
      onUploaded(item, URL.createObjectURL(file));
      setCaption("");
      setCsvNote(
        `Parked — no shape for this data yet (${census.rowCount} rows, columns: ${census.headers.slice(0, 8).join(", ")}). It's saved and visible; nothing was imported.`,
      );
      void fetch("/api/uploads/parked", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          headers: census.headers,
          rowCount: census.rowCount,
        }),
      }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV handling failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setCsvNote(null);

    // ---- Client-side limits (fail fast; the bucket is the real gate) ----------
    if (fileCount >= MAX_FILES) {
      setError(`Limit reached — ${MAX_FILES} files per project.`);
      return;
    }
    if (isHeic(file)) {
      setError("HEIC isn't supported — convert to JPG or PNG first, then upload.");
      return;
    }
    if (isCsv(file)) {
      // File door for structured data (spec 2026-08-03 §4): a CSV that matches
      // a shape goes through that shape's endpoint; one matching nothing parks
      // visibly with its header census — never silently blobbed, never rejected.
      await handleCsv(file);
      return;
    }
    if (!ALLOWED_MIME.has(file.type)) {
      setError("Only JPG, PNG, WebP, PDF, or CSV files are allowed.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File is over 10 MB. Compress or resize it first.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setNeedsLogin(true);
        return;
      }

      const ext = EXT_BY_MIME[file.type] ?? "bin";
      const path = `${user.id}/${projectId}/${crypto.randomUUID()}.${ext}`;

      // Upload under the user's JWT → Storage RLS scopes it to their uid prefix.
      const { error: upErr } = await supabase.storage
        .from(UPLOADS_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }

      const item: FileItem = {
        id: crypto.randomUUID(),
        added_at: new Date().toISOString(),
        origin: "web",
        kind: "file",
        storage_path: path,
        mime: file.type,
        size: file.size,
        ...(caption.trim() ? { caption: caption.trim() } : {}),
      };

      const objectUrl = URL.createObjectURL(file);
      onUploaded(item, objectUrl);
      setCaption("");

      // Fire PDF extraction — non-blocking. The route reads the PDF with Claude
      // and patches `extracted_text` on the item in the DB, so the next build
      // quotes the flyer's real figures. We surface a transient "reading" note;
      // builds don't wait on it.
      if (file.type === "application/pdf") {
        // Capture page 1 → PNG thumbnail off-screen, reusing the same object URL.
        setCaptures((c) => [...c, { id: item.id, url: objectUrl }]);
        setReading(true);
        void fetch(`/api/projects/${projectId}/extract-pdf`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ item_id: item.id }),
        })
          .catch(() => {})
          .finally(() => {
            setReading(false);
            onExtractionComplete?.();
          });
      }

      // Best-effort meter — never block the UI on it.
      void fetch("/api/meter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "upload", report_id: projectId }),
      }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = ""; // allow re-picking the same file
    }
  }

  if (needsLogin) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/50 p-4 text-sm text-gray-300">
        Sign in to attach files.{" "}
        <Link
          href={`/login?next=/project/${projectId}`}
          className="text-gulf-teal underline underline-offset-2"
        >
          Log in
        </Link>
      </div>
    );
  }

  const atLimit = fileCount >= MAX_FILES;

  return (
    <section className="rounded-xl border border-dashed border-white/15 bg-[#0d1e2b]/50 p-4">
      <h2 className="text-sm font-semibold text-white">Attach a file</h2>
      <p className="mt-1 text-xs text-gray-500">
        Images (JPG/PNG/WebP), PDF, or CSV · 10 MB max · {fileCount}/{MAX_FILES} used
      </p>

      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption (optional)"
        className="mt-3 w-full rounded-lg border border-white/10 bg-[#0d1e2b] px-3 py-2 text-sm text-white outline-none focus:border-gulf-teal/40"
      />

      <div className="mt-3 flex items-center gap-3">
        <label
          className={
            "cursor-pointer rounded-full px-4 py-2 text-sm font-medium " +
            (busy || atLimit
              ? "cursor-not-allowed bg-white/10 text-gray-500"
              : "bg-gulf-teal text-[#04121b]")
          }
        >
          {busy ? "Uploading…" : "Choose image, PDF, or CSV"}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.csv,text/csv"
            disabled={busy || atLimit}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {csvNote && <p className="mt-2 text-xs text-gulf-teal">{csvNote}</p>}
      {reading && (
        <p className="mt-2 flex items-center gap-2 text-xs text-gulf-teal">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gulf-teal" />
          Reading the PDF so your email can use its contents…
        </p>
      )}

      {captures.map((c) => (
        <PdfCapture
          key={c.id}
          url={c.url}
          projectId={projectId}
          itemId={c.id}
          onDone={() => setCaptures((list) => list.filter((x) => x.id !== c.id))}
        />
      ))}
    </section>
  );
}
