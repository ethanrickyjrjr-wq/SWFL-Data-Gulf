export type BoardSlug = "swfl_mls" | "nabor";

export interface BoardConfig {
  slug: BoardSlug;
  label: string;
  baseUrl: string;
  token: string;
  live: boolean;
}

export function getBoardConfig(slug: BoardSlug): BoardConfig {
  const map: Record<BoardSlug, { label: string; urlKey: string; tokenKey: string }> = {
    swfl_mls: {
      label: "SWFL MLS (Bridge)",
      urlKey: "RESO_BASE_URL_SWFL_MLS",
      tokenKey: "RESO_TOKEN_SWFL_MLS",
    },
    nabor: {
      label: "NABOR (Trestle)",
      urlKey: "RESO_BASE_URL_NABOR",
      tokenKey: "RESO_TOKEN_NABOR",
    },
  };
  const { label, urlKey, tokenKey } = map[slug];
  const baseUrl = process.env[urlKey] ?? "";
  const token = process.env[tokenKey] ?? "";
  return { slug, label, baseUrl, token, live: !!(baseUrl && token) };
}

export const ALL_BOARDS: BoardSlug[] = ["swfl_mls", "nabor"];
