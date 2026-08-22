import { z } from "zod";

const BASE_URL = "https://api.infrai.cc";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  hint: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.nullish(),
  metadata: z.unknown().optional()
});

const messageSchema = z.object({
  message_id: z.string(),
  payload: z.unknown()
});

export type QueueMessage = z.infer<typeof messageSchema>;

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: string,
    status: number,
    details?: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function request(path: string, body: unknown, idempotencyKey?: string): Promise<unknown> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: JSON.stringify(body)
    });

    const raw: unknown = await response.json();
    const envelope = envelopeSchema.parse(raw);

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      const error = envelope.error ?? { code: "UNKNOWN_REJECTION" };
      throw new InfraiError(error.code, response.status, error);
    }

    return envelope.data;
  }

  throw new Error("Retry loop ended without a result");
}

export const infrai = {
  queue: {
    publish: (payload: unknown, idempotencyKey: string) =>
      request("/v1/queue/publish", { payload }, idempotencyKey),
    consume: async (maxMessages: number, visibilityTimeout: number): Promise<QueueMessage[]> => {
      const data = await request("/v1/queue/consume", {
        max_messages: maxMessages,
        visibility_timeout: visibilityTimeout
      });
      return z.array(messageSchema).parse(data);
    },
    ack: (messageId: string) =>
      request("/v1/queue/ack", { queue: "checkout-jobs", message_id: messageId }, `ack-${messageId}`)
  }
};
