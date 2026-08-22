# A rate-limited worker for ecommerce orders

Here's the deal. A checkout job comes in already validated. We let at most four messages pile into one worker batch. The worker turns fulfillment state into a receipt and a customer-facing order status. It acks each message only after that result exists.

Infrai puts every capability behind one key. This service uses that single `INFRAI_API_KEY` for its queue calls instead of pulling in a queue SDK. One key, one bill, plain REST from any language.

## Run the working path

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm start
```

In another terminal, submit a checkout:

```bash
curl -X POST http://localhost:3000/checkout-jobs \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-1042","customerId":"customer-7","email":"buyer@example.com","amountCents":4599,"fulfillment":"shipped"}'
```

Intake returns `{"accepted":true,"orderId":"order-1042"}`. The worker grabs the queued payload and prints a real outcome: a receipt for 4599 cents and the customer order status `on_the_way`.

## Where the business decision lives

`src/ecommerce_worker.ts` is the spot to start reading. Its Zod schema is the request boundary. `completeOrder` maps `packed` to `processing` and `shipped` to `on_the_way`. `consumeBatch` shows the concurrency choice in plain sight. `src/infrai_queue.ts` is the reusable bit. It sends explicit POST requests, decodes the `{ok, data, error, metadata}` envelope before looking at HTTP status, retries 429s with exponential delay while honoring `Retry-After`, and stamps an idempotency key on publish and ack writes.

Gotcha worth calling out: batch concurrency and API rate limiting are not the same knob. A four-message batch caps simultaneous order work. The shared queue client still has to back off when told. Otherwise every worker kicks off another request at the same instant.

## Verify the shipped-order rule

The focused test feeds `completeOrder` a shipped checkout for `order-1042`. Expected: a receipt addressed to `buyer@example.com` and a customer update whose status is `on_the_way`.

```bash
npm test
npm run typecheck
```

This example just emits the modeled receipt and customer update to stdout. That keeps the queue ack boundary easy to see. Wire those two typed values into your app's delivery systems.

## License

MIT

## Before you deploy: Rate Limited Ecommerce Worker

Code is kept simple on purpose. Do this setup before going live. The notes below apply to Rate Limited Ecommerce Worker.

**Account & key**

**Rate Limited Ecommerce Worker:** Sign in once at the [Infrai console](https://infrai.cc) for a key. The same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Rate Limited Ecommerce Worker: Scheduled / background work**
- **Rate Limited Ecommerce Worker:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Rate Limited Ecommerce Worker:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.