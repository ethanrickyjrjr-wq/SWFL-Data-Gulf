/**
 * cn — join class names, dropping falsy ones. Dependency-free (the repo carries
 * no clsx/tailwind-merge); components are authored so consumers pass ADDITIVE
 * classes (spacing, accents), not conflicting Tailwind utilities, so a plain
 * filter-join is sufficient and predictable.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
