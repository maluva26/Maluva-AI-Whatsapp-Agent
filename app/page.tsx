"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import type { Conversation, ConversationMode, Message } from "@/lib/types";

type ConversationsResponse = {
  conversations: Conversation[];
};

type MessagesResponse = {
  messages: Message[];
};

const modes: ConversationMode[] = ["ai", "manual", "paused"];

function formatTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function DashboardPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [manualMessage, setManualMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [direct, setDirect] = useState({
    waId: "",
    profileName: "",
    incoming: "",
    response: "",
    sendToWhatsApp: false
  });

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId),
    [conversations, selectedId]
  );

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load conversations");
    const data = (await response.json()) as ConversationsResponse;
    setConversations(data.conversations);
    setSelectedId((current) => current || data.conversations[0]?.id || "");
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Could not load messages");
    const data = (await response.json()) as MessagesResponse;
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    void loadConversations().catch((caught) => setError(caught.message));
    const timer = window.setInterval(() => {
      void loadConversations().catch((caught) => setError(caught.message));
    }, 2500);

    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    void loadMessages(selectedId).catch((caught) => setError(caught.message));
    const timer = window.setInterval(() => {
      void loadMessages(selectedId).catch((caught) => setError(caught.message));
    }, 2500);

    return () => window.clearInterval(timer);
  }, [loadMessages, selectedId]);

  async function updateMode(mode: ConversationMode) {
    if (!selectedConversation) return;

    setError("");
    const response = await fetch(`/api/conversations/${selectedConversation.id}/mode`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode })
    });

    if (!response.ok) {
      setError("Could not update mode");
      return;
    }

    await loadConversations();
  }

  async function sendManualMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation || !manualMessage.trim()) return;

    setSaving(true);
    setError("");

    const response = await fetch(`/api/conversations/${selectedConversation.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: manualMessage })
    });

    setSaving(false);
    if (!response.ok) {
      setError("Message was saved but WhatsApp send failed");
    }

    setManualMessage("");
    await loadMessages(selectedConversation.id);
    await loadConversations();
  }

  async function saveDirectConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch("/api/direct-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(direct)
    });

    setSaving(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Could not save directed conversation");
      return;
    }

    setDirect({
      waId: "",
      profileName: "",
      incoming: "",
      response: "",
      sendToWhatsApp: false
    });
    await loadConversations();
  }

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <h1>WhatsApp AI Agent</h1>
            <p>{conversations.length} conversations</p>
          </div>
          <span className="live">Live</span>
        </div>

        <div className="conversationList">
          {conversations.map((conversation) => (
            <button
              className={`conversationItem ${
                conversation.id === selectedId ? "active" : ""
              }`}
              key={conversation.id}
              onClick={() => setSelectedId(conversation.id)}
              type="button"
            >
              <span className="conversationName">
                {conversation.profile_name || conversation.wa_id}
              </span>
              <span className={`mode mode-${conversation.mode}`}>
                {conversation.mode}
              </span>
              <span className="preview">
                {conversation.last_message_preview || "No messages yet"}
              </span>
              <span className="time">{formatTime(conversation.last_message_at)}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="chatPanel">
        {selectedConversation ? (
          <>
            <header className="chatHeader">
              <div>
                <h2>{selectedConversation.profile_name || selectedConversation.wa_id}</h2>
                <p>{selectedConversation.wa_id}</p>
              </div>
              <div className="modeControl" aria-label="Conversation mode">
                {modes.map((mode) => (
                  <button
                    className={selectedConversation.mode === mode ? "selected" : ""}
                    key={mode}
                    onClick={() => void updateMode(mode)}
                    type="button"
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </header>

            <div className="messages">
              {messages.map((message) => (
                <div
                  className={`messageBubble ${
                    message.direction === "outgoing" ? "outgoing" : "incoming"
                  }`}
                  key={message.id}
                >
                  <p>{message.content}</p>
                  <span>
                    {message.source} · {message.status} · {formatTime(message.created_at)}
                  </span>
                </div>
              ))}
            </div>

            <form className="composer" onSubmit={sendManualMessage}>
              <textarea
                onChange={(event) => setManualMessage(event.target.value)}
                placeholder="Manual reply"
                rows={3}
                value={manualMessage}
              />
              <button disabled={saving || !manualMessage.trim()} type="submit">
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="emptyState">Waiting for the first WhatsApp message.</div>
        )}
      </section>

      <aside className="directPanel">
        <h2>Directed Conversation</h2>
        <form onSubmit={saveDirectConversation}>
          <label>
            Phone
            <input
              onChange={(event) =>
                setDirect((current) => ({ ...current, waId: event.target.value }))
              }
              placeholder="27821234567"
              value={direct.waId}
            />
          </label>

          <label>
            Name
            <input
              onChange={(event) =>
                setDirect((current) => ({
                  ...current,
                  profileName: event.target.value
                }))
              }
              placeholder="Customer"
              value={direct.profileName}
            />
          </label>

          <label>
            Incoming
            <textarea
              onChange={(event) =>
                setDirect((current) => ({
                  ...current,
                  incoming: event.target.value
                }))
              }
              rows={4}
              value={direct.incoming}
            />
          </label>

          <label>
            Bot response
            <textarea
              onChange={(event) =>
                setDirect((current) => ({
                  ...current,
                  response: event.target.value
                }))
              }
              placeholder="Leave blank to use the guided store bot"
              rows={4}
              value={direct.response}
            />
          </label>

          <label className="checkbox">
            <input
              checked={direct.sendToWhatsApp}
              onChange={(event) =>
                setDirect((current) => ({
                  ...current,
                  sendToWhatsApp: event.target.checked
                }))
              }
              type="checkbox"
            />
            Send response to WhatsApp
          </label>

          <button disabled={saving} type="submit">
            Save
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}
      </aside>
    </main>
  );
}
