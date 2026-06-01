-- DBPR Press Releases table
-- Source: myfloridalicense.com/press-releases/ weekly scrape via Firecrawl
-- Consumer: news-swfl brain (refinery/packs/news-swfl.mts)
-- Cadence: Monday 09:00 UTC via dbpr-press-releases-weekly.yml

create table if not exists public.dbpr_press_releases (
  id             bigint generated always as identity primary key,
  source_url     text unique not null,
  title          text,
  published_date date,
  body_text      text,
  summary        text,                       -- filled by enricher (Sonnet)
  topics         text[],                     -- filled by enricher
  affected_industries text[],                -- filled by enricher
  geographic_mentions text[],                -- filled by enricher
  is_swfl_relevant boolean default false,    -- filled by enricher
  scraped_at     timestamptz,
  created_at     timestamptz default now()
);

create index if not exists dbpr_press_releases_published_date_idx
  on public.dbpr_press_releases (published_date desc);

create index if not exists dbpr_press_releases_is_swfl_relevant_idx
  on public.dbpr_press_releases (is_swfl_relevant);
