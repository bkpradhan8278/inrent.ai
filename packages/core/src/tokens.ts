/**
 * Token estimation used only for pre-flight checks (credit reservation, context-length
 * filtering) and as a last-resort fallback when a provider omits usage. Billing always
 * prefers provider-reported usage, and estimated usage is flagged on the request record.
 */

export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  // ~4 chars/token for English; CJK is closer to 1 char/token.
  const cjk = text.match(/[぀-ヿ㐀-䶿一-鿿가-힯]/g)?.length ?? 0;
  const rest = text.length - cjk;
  return Math.ceil(rest / 4) + cjk;
}

type ContentPart = { type?: string; text?: string } | string;

export function estimateContentTokens(content: unknown): number {
  if (content === null || content === undefined) return 0;
  if (typeof content === "string") return estimateTextTokens(content);
  if (Array.isArray(content)) {
    return (content as ContentPart[]).reduce((sum, part) => {
      if (typeof part === "string") return sum + estimateTextTokens(part);
      if (part?.type === "text" && typeof part.text === "string") return sum + estimateTextTokens(part.text);
      if (part?.type === "image_url" || part?.type === "input_image") return sum + 850;
      return sum + 50;
    }, 0);
  }
  return estimateTextTokens(JSON.stringify(content));
}

export function estimateMessagesTokens(messages: Array<{ content?: unknown; tool_calls?: unknown }>): number {
  let total = 3;
  for (const m of messages) {
    total += 4 + estimateContentTokens(m.content);
    if (m.tool_calls) total += estimateTextTokens(JSON.stringify(m.tool_calls));
  }
  return total;
}
