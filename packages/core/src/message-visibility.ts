import type { MessageBlock } from "@rakazo/contracts";

type PresentableMessage = {
  runId?: string;
  clientNonce?: string | null;
  blocks: readonly MessageBlock[];
};

export const USER_PROGRESS_CLIENT_NONCE_PREFIX = "user-progress:";

export function isUserProgressClientNonce(clientNonce: string | null | undefined): boolean {
  return Boolean(clientNonce?.startsWith(USER_PROGRESS_CLIENT_NONCE_PREFIX));
}

export type UserVisibleMessagesOptions = {
  /**
   * Keep `bot_message_sent` / `bot_message_received` rows as compact chips
   * (web CollaborationMarker; mobile AgentEventLabel). Peer bodies stay hidden.
   */
  includePeerReceipts?: boolean;
  /** Peer-run ids from `run.trigger === "bot_message"` when receipts may be out of window. */
  knownPeerRunIds?: Iterable<string>;
  /** Peer-run ids woken by a result/status/fyi that should report to the user. */
  knownPeerReportRunIds?: Iterable<string>;
};

export function isPeerReceiptBlocks(blocks: readonly MessageBlock[]): boolean {
  return blocks.some(
    (block) => block.kind === "bot_message_sent" || block.kind === "bot_message_received",
  );
}

/** A peer wake that reports information back, rather than assigning hidden work. */
export function isPeerReportBlocks(blocks: readonly MessageBlock[]): boolean {
  return blocks.some(
    (block) =>
      block.kind === "bot_message_received" &&
      (block.intent === "result" || block.intent === "status" || block.intent === "fyi"),
  );
}

/** A bot's terminal summary after peer work, without mid-turn narration. */
export function isPeerSummaryMessage(message: PresentableMessage): boolean {
  return (
    !isUserProgressClientNonce(message.clientNonce) &&
    message.blocks.some((block) => block.kind === "text" && block.text.trim().length > 0)
  );
}

/** Drop peer-run activity; keep final summaries and optionally compact receipt rows. */
export function userVisibleMessages<T extends PresentableMessage>(
  messages: readonly T[],
  options: UserVisibleMessagesOptions = {},
): T[] {
  const peerRunIds = new Set([
    ...(options.knownPeerRunIds ?? []),
    ...messages
      .filter((message) => message.blocks.some((block) => block.kind === "bot_message_received"))
      .flatMap((message) => (message.runId ? [message.runId] : [])),
  ]);
  const includePeerReceipts = options.includePeerReceipts === true;
  const peerReportRunIds = new Set([
    ...(options.knownPeerReportRunIds ?? []),
    ...messages
      .filter((message) => isPeerReportBlocks(message.blocks))
      .flatMap((message) => (message.runId ? [message.runId] : [])),
  ]);

  return messages.filter((message) => {
    if (isPeerReceiptBlocks(message.blocks)) return includePeerReceipts;
    if (!message.runId || !peerRunIds.has(message.runId)) return true;
    return peerReportRunIds.has(message.runId) && isPeerSummaryMessage(message);
  });
}
