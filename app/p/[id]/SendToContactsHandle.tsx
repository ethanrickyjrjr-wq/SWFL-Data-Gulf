"use client";

// Client island for the server-rendered /p/[id] page: a "Send to contacts" button
// that opens the contact picker → blast. Mirrors the SendWeeklyHandle pattern
// (server decides isOwner, conditionally mounts this client component).
import { useState } from "react";
import { ContactPickerModal } from "@/components/contacts/ContactPickerModal";

export function SendToContactsHandle({ deliverableId }: { deliverableId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-gulf-teal px-4 py-1.5 text-xs font-semibold text-navy-dark transition-opacity hover:opacity-90"
      >
        Send to contacts
      </button>
      {open && <ContactPickerModal deliverableId={deliverableId} onClose={() => setOpen(false)} />}
    </>
  );
}
