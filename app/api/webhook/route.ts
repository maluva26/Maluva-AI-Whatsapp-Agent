import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { processWhatsAppWebhook } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === serverEnv.whatsappVerifyToken()) {
    return new NextResponse(challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ received: true });
  }

  void processWhatsAppWebhook(payload as never).catch((error) => {
    console.error("Webhook processing failed", error);
  });

  return NextResponse.json({ received: true });
}
