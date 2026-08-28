import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getLeadDetail } from "@/lib/db/leads";
import { toLeadDetailView } from "@/lib/db/lead-view";

/**
 * Lead drill-down detail for the inspection drawer.
 *
 * Scoping happens in `getLeadDetail`, which applies the caller's tenancy
 * filter — a publisher requesting another publisher's lead id gets a 404, not
 * a 403, so the endpoint cannot be used to probe which ids exist.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/leads/[id]">,
) {
  const user = await getSession();
  if (!user) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const lead = await getLeadDetail(user, id);
  if (!lead) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return Response.json(toLeadDetailView(lead));
}
