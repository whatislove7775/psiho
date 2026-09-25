"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Spinner } from "@/ui";
import { chatApi, type AIStatus, type ChatMessage, type Conversation } from "@/lib/api/chat";
import { chatSocket } from "@/lib/chat/socket";
import { ConversationView } from "@/components/chat/ConversationView";
import chat from "@/components/chat/chat.module.css";
import { CallCard } from "./CallCard";

const renderSystem = (m: ChatMessage) => (m.card ? <CallCard msg={m} /> : null);

/**
 * The chat thread of a dialogue: messages, voice, files and call cards.
 *
 * Contract with the call screen (C2): `<DialogThread conversationId={...} compact />`
 * renders only the thread and the composer (no header), for the in-call side panel.
 * The dialogues page passes the already loaded conversation and header extras.
 */
export function DialogThread({
  conversationId,
  compact,
  conversation,
  onBack,
  onChange,
  headerActions,
  banner,
  composerNotice,
  composerDisabled,
  subtitle,
  ai,
  onAIStatus,
}: {
  conversationId: string;
  compact?: boolean;
  conversation?: Conversation;
  onBack?: () => void;
  onChange?: (c: Conversation) => void;
  headerActions?: ReactNode;
  banner?: ReactNode;
  composerNotice?: ReactNode;
  composerDisabled?: boolean;
  subtitle?: string;
  ai?: AIStatus | null;
  onAIStatus?: (st: AIStatus) => void;
}) {
  const [own, setOwn] = useState<Conversation | null>(conversation ?? null);
  const [failed, setFailed] = useState(false);
  const conv = conversation ?? own;

  useEffect(() => chatSocket.acquire(), []);

  useEffect(() => {
    if (conversation) return;
    let alive = true;
    setFailed(false);
    chatApi
      .conversation(conversationId)
      .then((c) => alive && setOwn(c))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [conversationId, conversation]);

  const change = useCallback(
    (c: Conversation) => {
      setOwn(c);
      onChange?.(c);
    },
    [onChange],
  );

  if (!conv) {
    return (
      <div className={chat.center} style={{ flex: 1 }}>
        {failed ? <p className={chat.placeholderText}>Не получилось открыть переписку.</p> : <Spinner />}
      </div>
    );
  }

  return (
    <ConversationView
      key={conv.id}
      conv={conv}
      onBack={onBack}
      onChange={change}
      renderSystem={renderSystem}
      headerActions={headerActions}
      banner={banner}
      compact={compact}
      composerNotice={composerNotice}
      composerDisabled={composerDisabled}
      subtitle={subtitle}
      ai={ai}
      onAIStatus={onAIStatus}
    />
  );
}

export default DialogThread;
