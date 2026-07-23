// components/email-lab/AddBlockPanel.tsx (Card 32) — the user add-block palette.
// The menu is derived from the ONE supply contract (block-contract.ts): every
// block whose contract entry carries `menu` is user-addable, in contract order.
// Re-exported here so existing importers (EmailLabGridShell) keep their path.
//
// The `AddBlockPanel` component itself was removed 07/22/2026 (checks:
// sa0718_the_exported_addblockpanel_component_is_de) — it was never mounted
// anywhere in production. EmailLabGridShell (the ONE email surface since the
// 2026-07-07 retire-block-shell pass) imports only `BLOCK_MENU` below and
// renders its own dark-styled inline "Add a block" grid; the light-mode
// component here was dead weight left over from the deleted linear shell.
export { BLOCK_MENU } from "@/lib/email/doc/block-contract";
