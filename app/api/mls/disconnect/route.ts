import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function DELETE(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(req.headers.get("Authorization")?.replace("Bearer ", "") ?? "");
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { connection_id } = (await req.json()) as { connection_id: string };
  const { data: conn, error } = await supabase
    .from("user_mls_connections")
    .select("id, user_id, board_slug")
    .eq("id", connection_id)
    .eq("user_id", user.id)
    .single();
  if (error || !conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete data_lake rows first
  await supabase
    .schema("data_lake")
    .from("user_mls_listings")
    .delete()
    .eq("user_id", user.id)
    .eq("board_slug", conn.board_slug);
  await supabase
    .schema("data_lake")
    .from("user_mls_stats")
    .delete()
    .eq("user_id", user.id)
    .eq("board_slug", conn.board_slug);

  // Delete the connection record
  await supabase.from("user_mls_connections").delete().eq("id", connection_id);

  return NextResponse.json({ ok: true });
}
