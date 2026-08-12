import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import ContactsClient from "./ContactsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/contacts");

  return <ContactsClient />;
}
