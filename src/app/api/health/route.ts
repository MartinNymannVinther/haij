import { NextResponse } from "next/server";
import { appPool } from "@/core/db/client";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for Docker, Coolify and uptime monitoring.
 * Verifies database connectivity. Deliberately returns no version or
 * environment information.
 */
export async function GET() {
  try {
    await appPool.query("select 1");
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
