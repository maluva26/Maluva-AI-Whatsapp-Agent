import { NextResponse } from "next/server";

import { setConversationMode } from "@/lib/store";
import type { ConversationMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const modes = new Set(["ai", "manual", "paused"]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => ({}));
  const mode = body.mode as ConversationMode;

  if (!modes.has(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const conversation = await setConversationMode(params.id, mode);
  return NextResponse.json({ conversation });
}
