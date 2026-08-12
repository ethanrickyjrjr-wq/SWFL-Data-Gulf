// lib/brand/global-save-message.ts
//
// saveBrandGlobal() (app/project/[id]/ProjectWorkspace.tsx) fires two writes: the
// authoritative project-level PATCH (branding on `projects`) and a best-effort
// account-level PATCH (`/api/user/brand`) that carries the brand to future projects.
// The project save stays the OK/close gate — but a silent account-sync failure used
// to report the same plain "Branding saved" as a full success, hiding that the
// account palette library never picked up the change (branding_global_save_ux).
//
// This picks the message shown once the project save has already succeeded, folding
// in whether the parallel account sync also succeeded.

export function brandGlobalSaveMessage(accountSyncOk: boolean): string {
  return accountSyncOk ? "Branding saved" : "Branding saved to this project (account sync failed)";
}

/**
 * The decision flow saveBrandGlobal() runs, with the two writes and the message
 * setter injected so it's testable without mounting ProjectWorkspace.tsx (no RTL
 * harness exists in this repo — see bank-brand-fields.test.ts for the same
 * injected-dependency pattern). `saveProject` and `syncAccount` fire concurrently;
 * the project save is always the OK/close gate and is never blocked or reverted by
 * a failed account sync. `setMessage` is only called to OVERRIDE the plain success
 * message `saveProject` (patch()) already set — never called on a project-save
 * failure, where patch()'s own "Save failed" message stands untouched.
 */
export async function resolveBrandGlobalSave(opts: {
  saveProject: () => Promise<boolean>;
  syncAccount: () => Promise<boolean>;
  setMessage: (message: string) => void;
}): Promise<boolean> {
  const accountSync = opts.syncAccount();
  const projectSaveOk = await opts.saveProject();
  if (projectSaveOk) {
    const accountSyncOk = await accountSync;
    if (!accountSyncOk) opts.setMessage(brandGlobalSaveMessage(false));
  }
  return projectSaveOk;
}
