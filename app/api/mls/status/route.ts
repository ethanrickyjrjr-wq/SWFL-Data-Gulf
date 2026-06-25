import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { NextResponse } from "next/server";
import { ALL_BOARDS, getBoardConfig } from "@/lib/reso/boards";

export async function GET() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceSupabase = createServiceRoleClient();
  const { data: connections } = await serviceSupabase
    .from("user_mls_connections")
    .select()
    .eq("user_id", user.id);

  const boards = ALL_BOARDS.map((slug) => ({
    slug,
    label: getBoardConfig(slug).label,
    live: getBoardConfig(slug).live,
    connection: connections?.find((c) => c.board_slug === slug) ?? null,
  }));

  return NextResponse.json({ boards });
}
