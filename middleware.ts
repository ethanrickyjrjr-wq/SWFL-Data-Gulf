import { type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

export function middleware(request: NextRequest) {
  return createClient(request);
}

export const config = {
  matcher: [
    // Run on every path EXCEPT static assets, image optimization output, and
    // the public brain-read API. /api/b/* is stateless and must stay reachable
    // without any auth-client env vars present.
    "/((?!api/b/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
