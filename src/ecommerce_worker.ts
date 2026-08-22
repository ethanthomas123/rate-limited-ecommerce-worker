import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, infrai, type QueueMessage } from "./infrai_queue.js";

export const checkoutJobSchema = z.object({
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  email: z.string().email(),
  amountCents: z.number().int().positive(),
  fulfillment: z.enum(["packed", "shipped"])
});

export type CheckoutJob = z.infer<typeof checkoutJobSchema>;

export type OrderOutcome = {
  orderId: string;
  receipt: { recipient: string; amountCents: number };
  customerUpdate: { customerId: string; orderStatus: "processing" | "on_the_way" };
};

export function completeOrder(job: CheckoutJob): OrderOutcome {
  return {
    orderId: job.orderId,
    receipt: { recipient: job.email, amountCents: job.amountCents },
    customerUpdate: {
      customerId: job.customerId,
      orderStatus: job.fulfillment === "shipped" ? "on_the_way" : "processing"
    }
  };
}

async function readJson(request: AsyncIterable<Buffer | string>): Promise<unknown> {
  let body = "";
  for await (const chunk of request) body += chunk.toString();
  return JSON.parse(body);
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function processMessage(message: QueueMessage): Promise<void> {
  const job = checkoutJobSchema.parse(message.payload);
  const outcome = completeOrder(job);
  console.log(JSON.stringify(outcome));
  await infrai.queue.ack(message.message_id);
}

export async function consumeBatch(concurrency = 4): Promise<number> {
  const messages = await infrai.queue.consume(concurrency, 30);
  await Promise.all(messages.map(processMessage));
  return messages.length;
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/checkout-jobs") {
    json(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const job = checkoutJobSchema.parse(await readJson(request));
    await infrai.queue.publish(job, `checkout-${job.orderId}`);
    json(response, 202, { accepted: true, orderId: job.orderId });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      json(response, 400, { error: "invalid_checkout_job" });
      return;
    }
    if (error instanceof InfraiError) {
      json(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code
      });
      return;
    }
    json(response, 500, { error: "request_failed" });
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`checkout intake listening on http://localhost:${port}`));

  const poll = async () => {
    try {
      await consumeBatch();
    } catch (error) {
      console.error(error);
    } finally {
      setTimeout(poll, 1_000);
    }
  };
  void poll();
}
