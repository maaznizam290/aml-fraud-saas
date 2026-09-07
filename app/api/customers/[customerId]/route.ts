/**
 * Customer profile detail — used by the investigation workspace and, for a
 * customer lookup outside of an alert's context, standalone. Read-only.
 */
import { z } from "zod";
import { NextResponse } from "next/server";

import { buildRuntime } from "@/lib/orchestration/runtime.js";
import { scopeToOrg } from "@/lib/dashboard/util.js";

const querySchema = z.object({ organizationId: z.string().min(1) });

export async function GET(
  request: Request,
  { params }: { params: { customerId: string } }
): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues }, { status: 400 });
  }
  const { organizationId } = parsed.data;
  const runtime = buildRuntime();

  const customer = scopeToOrg(await runtime.store.getCustomer(params.customerId), organizationId);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  const profile = await runtime.store.getCustomerProfile(params.customerId);

  return NextResponse.json({
    customer,
    profile: profile && profile.organization_id === organizationId ? profile : null,
  });
}
