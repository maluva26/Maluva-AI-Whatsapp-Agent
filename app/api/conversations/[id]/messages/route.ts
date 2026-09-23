import { NextResponse } from "next/server";

import { getMessages } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const messages = await getMessages(params.id);
  return NextResponse.json({ messages });
}
