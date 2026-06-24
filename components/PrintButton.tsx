"use client";

export function PrintButton({
  reportId,
  label = "Save as PDF",
}: {
  reportId?: string;
  label?: string;
}) {
  async function handleClick() {
    if (reportId) {
      await fetch("/api/meter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "export_print", report_id: reportId }),
      });
    }
    window.print();
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className="print-hide rounded-full border border-[#3DC9C0]/40 px-4 py-2 text-sm font-medium text-[#3DC9C0] transition-colors hover:bg-[#3DC9C0]/10"
    >
      {label}
    </button>
  );
}
