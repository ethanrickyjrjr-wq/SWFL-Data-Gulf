import type { SupabaseClient } from "@supabase/supabase-js";
import { ResoClient } from "./client";
import type { BoardSlug } from "./boards";
import { pullAgentListings } from "./pull-agent-listings";
import { pullZipStats } from "./pull-zip-stats";

export interface Connection {
  id: string;
  user_id: string;
  board_slug: BoardSlug;
  member_mls_id: string;
  last_entity_event_sequence: number | null;
}

interface EntityEvent {
  EntityEventSequence: number;
  ResourceName?: string;
  EntityKey: string;
  EventType?: string;
}

interface ResoProperty {
  ListingKey: string;
  ListAgentMlsId?: string;
  ListPrice?: number;
  ClosePrice?: number;
  ListingContractDate?: string;
  CloseDate?: string;
  DaysOnMarket?: number;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  LivingArea?: number;
  PostalCode?: string;
  StandardStatus?: string;
  PropertyType?: string;
}

const MEMBER_MLS_ID_RE = /^[A-Za-z0-9\-\.]{1,64}$/;

export async function syncConnection(
  supabase: SupabaseClient,
  conn: Connection,
): Promise<{ listings: number; zips: string[] }> {
  const { id, user_id, board_slug, member_mls_id, last_entity_event_sequence } = conn;
  if (!MEMBER_MLS_ID_RE.test(member_mls_id)) {
    throw new Error(`Invalid MemberMlsId: ${member_mls_id}`);
  }

  // ── First sync: full pull ────────────────────────────────────────────────
  if (last_entity_event_sequence === null) {
    const pulled = await pullAgentListings(supabase, board_slug, member_mls_id, user_id);
    await pullZipStats(supabase, board_slug, user_id, pulled.zips);

    // Seed the sequence pointer so next sync is incremental
    const client = new ResoClient(board_slug);
    const events = await client.get<EntityEvent>("EntityEvent", {
      $orderby: "EntityEventSequence desc",
      $top: "1",
      $select: "EntityEventSequence",
    });
    const maxSeq = events[0]?.EntityEventSequence ?? 0;

    await supabase
      .from("user_mls_connections")
      .update({
        last_entity_event_sequence: maxSeq,
        last_synced_at: new Date().toISOString(),
        status: "active",
      })
      .eq("id", id);

    return { listings: pulled.count, zips: pulled.zips };
  }

  // ── Incremental sync via EntityEventSequence ─────────────────────────────
  const client = new ResoClient(board_slug);
  const events = await client.get<EntityEvent>("EntityEvent", {
    $filter: `EntityEventSequence gt ${last_entity_event_sequence} and ResourceName eq 'Property'`,
    $select: "EntityEventSequence,EntityKey,EventType",
    $orderby: "EntityEventSequence asc",
  });

  if (events.length === 0) {
    await supabase
      .from("user_mls_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", id);
    return { listings: 0, zips: [] };
  }

  const maxSeq = events.reduce((m, e) => Math.max(m, e.EntityEventSequence), 0);
  const changedKeys = [...new Set(events.map((e) => e.EntityKey))];

  // Re-fetch changed listings that belong to this agent — batch in chunks of 50
  const CHUNK = 50;
  const allUpdated: ResoProperty[] = [];
  for (let i = 0; i < changedKeys.length; i += CHUNK) {
    const chunk = changedKeys.slice(i, i + CHUNK);
    const keyFilter = chunk.map((k) => `ListingKey eq '${k}'`).join(" or ");
    const props = await client.get<ResoProperty>("Property", {
      $filter: `(${keyFilter}) and ListAgentMlsId eq '${member_mls_id}'`,
      $select:
        "ListingKey,ListPrice,ClosePrice,ListingContractDate,CloseDate,DaysOnMarket,BedroomsTotal,BathroomsTotalInteger,LivingArea,PostalCode,StandardStatus,PropertyType",
    });
    allUpdated.push(...props);
  }

  // Keys that changed but weren't re-fetched = no longer this agent's listing
  const returnedKeys = new Set(allUpdated.map((p) => p.ListingKey));
  const deletedKeys = changedKeys.filter((k) => !returnedKeys.has(k));
  if (deletedKeys.length > 0) {
    await supabase
      .schema("data_lake")
      .from("user_mls_listings")
      .delete()
      .eq("user_id", user_id)
      .eq("board_slug", board_slug)
      .in("listing_key", deletedKeys);
  }

  if (allUpdated.length > 0) {
    const rows = allUpdated.map((p) => ({
      listing_key: p.ListingKey,
      user_id,
      board_slug,
      list_price: p.ListPrice ?? null,
      close_price: p.ClosePrice ?? null,
      listing_contract_date: p.ListingContractDate ?? null,
      close_date: p.CloseDate ?? null,
      days_on_market: p.DaysOnMarket ?? null,
      bedrooms_total: p.BedroomsTotal ?? null,
      bathrooms_total: p.BathroomsTotalInteger ?? null,
      living_area: p.LivingArea ?? null,
      postal_code: p.PostalCode ?? null,
      standard_status: p.StandardStatus ?? null,
      property_type: p.PropertyType ?? null,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .schema("data_lake")
      .from("user_mls_listings")
      .upsert(rows, { onConflict: "listing_key,board_slug" });
    if (error) throw new Error(`upsert listings: ${error.message}`);
  }

  // Recompute stats for affected ZIPs
  const affectedZips = [
    ...new Set(allUpdated.map((p) => p.PostalCode).filter((z): z is string => z != null)),
  ];
  if (affectedZips.length > 0) {
    await pullZipStats(supabase, board_slug, user_id, affectedZips);
  }

  await supabase
    .from("user_mls_connections")
    .update({
      last_entity_event_sequence: maxSeq,
      last_synced_at: new Date().toISOString(),
      status: "active",
    })
    .eq("id", id);

  return { listings: allUpdated.length, zips: affectedZips };
}
