# WhatsApp AI Agent

A small production-oriented Next.js app that replaces n8n for a WhatsApp AI assistant:

1. Meta sends WhatsApp webhooks to `GET/POST /api/webhook`.
2. Incoming text messages are stored in Supabase.
3. The app sends recent conversation history to OpenRouter.
4. The AI response is sent back through the Meta WhatsApp Cloud API.
5. The dashboard shows conversations and lets you switch modes, send manual replies, or create directed conversations.

## Run locally

```bash
npm install
npm run migrate:supabase
npm run dev
```

Open `http://localhost:3000`.

## Webhook setup

Use your public app URL in Meta:

```text
https://YOUR_DOMAIN.com/api/webhook
```

The verify token must match `WHATSAPP_VERIFY_TOKEN`. This app answers Meta verification requests by returning `hub.challenge` when `hub.mode=subscribe` and the token matches.

For local testing, expose the app with a tunnel such as ngrok and use the tunnel URL:

```text
https://YOUR_TUNNEL.ngrok-free.app/api/webhook
```

## Conversation modes

- `ai`: inbound WhatsApp messages are saved, sent to OpenRouter, replied to through WhatsApp, and stored.
- `manual`: inbound messages are saved but the bot does not auto-reply.
- `paused`: inbound messages are saved and no auto-reply is sent.

## API routes

- `GET /api/webhook`: Meta webhook verification.
- `POST /api/webhook`: receives WhatsApp webhooks, stores messages, deduplicates by `whatsapp_msg_id`, and starts processing quickly.
- `GET /api/conversations`: dashboard conversation list.
- `GET /api/conversations/:id/messages`: messages for a conversation.
- `PATCH /api/conversations/:id/mode`: set `ai`, `manual`, or `paused`.
- `POST /api/conversations/:id/send`: send a manual WhatsApp reply and store it.
- `POST /api/direct-message`: create a directed incoming message plus bot response, optionally sending the response to WhatsApp.

## Deployment notes

- Keep `.env.local` out of git. Use platform environment variables in production.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to browser code.
- `WHATSAPP_ACCESS_TOKEN` should be a permanent Meta System User token with WhatsApp permissions.
- Webhook POST returns `200` immediately, but uses Vercel `waitUntil()` so the async reply work continues reliably after the response.
- The webhook route sets `maxDuration = 60`; keep Fluid Compute enabled or set a compatible function duration in Vercel if AI replies take longer.
- The database enforces duplicate webhook protection with a unique `whatsapp_msg_id`.
- `WHATSAPP_GRAPH_VERSION` defaults to `v26.0` and can be changed without code edits.
