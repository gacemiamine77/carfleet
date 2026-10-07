import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// CORS global API : preflight + Private Network Access (Chrome exige ce header
// quand une page localhost/http appelle l'IP LAN 192.168.x, sinon "Failed to fetch").
export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Private-Network": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Private-Network", "true");
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
