/**
 * Local-claim / global-fallback for the account menu's Brand item (spec
 * 2026-07-05-account-quick-access). A page that already renders a brand editor
 * (project workspace pill, email-lab accordions) registers a handler on mount;
 * the SiteShell menu calls revealBrandPanel() first and only navigates to the
 * /account/brand route-modal when nothing claims the click. Module-level state
 * is fine: one browser tab, one active surface; newest registration wins.
 */
const handlers: Array<() => void> = [];

export function registerBrandPanel(handler: () => void): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.indexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export function revealBrandPanel(): boolean {
  const h = handlers[handlers.length - 1];
  if (!h) return false;
  h();
  return true;
}

/** Shared glow so every surface pulses identically (class in globals.css). */
export function pulseBrandPanel(el: HTMLElement | null): void {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("brand-reveal-pulse");
  setTimeout(() => el.classList.remove("brand-reveal-pulse"), 2200);
}
