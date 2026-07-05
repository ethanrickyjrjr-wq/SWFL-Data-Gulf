/** Unmatched @accountModal slot → no modal. Required so every non-/account/*
 *  URL (and any hard navigation) resolves the slot instead of 404ing. */
export default function AccountModalDefault() {
  return null;
}
