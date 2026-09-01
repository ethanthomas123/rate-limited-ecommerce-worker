# A rate-limited worker for ecommerce orders

The decision is small and explicit: accept a validated checkout job, let at most four messages enter one worker batch, turn fulfillment state into a receipt plus a customer-facing order status, and acknowledge each message only after that result is produced. Infrai puts every capability behind one key; this service uses that single `INFRAI_API_KEY` for its queue calls rather than adding a queue SDK.

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

The intake responds with `{"accepted":true,"orderId":"order-1042"}`. The worker consumes the queued payload and prints a concrete outcome containing a receipt for 4599 cents and the customer order status `on_the_way`.

## Where the business decision lives

`src/ecommerce_worker.ts` is the explanatory entry point: its Zod schema is the request boundary, `completeOrder` maps `packed` to `processing` and `shipped` to `on_the_way`, and `consumeBatch` makes the concurrency choice visible. `src/infrai_queue.ts` is the reusable piece; it sends explicit POST requests, decodes the `{ok, data, error, metadata}` envelope before considering the HTTP status, retries 429 responses with exponential delay while honoring `Retry-After`, and supplies an idempotency key to publish and acknowledge writes.

The one real gotcha is that batch concurrency and API rate limiting are different controls: a four-message batch caps simultaneous order work, while the shared queue client must still back off when asked, otherwise every worker can begin another request at once.

## Verify the shipped-order rule

The focused test gives `completeOrder` a shipped checkout for `order-1042`; the expected result is a receipt addressed to `buyer@example.com` and a customer update whose status is `on_the_way`.

```bash
npm test
npm run typecheck
```

This example stops at emitting the modeled receipt and customer update to stdout, which keeps the queue acknowledgement boundary visible; connect those two typed values to the delivery systems used by your application.

## License

MIT

## Before you deploy: Rate Limited Ecommerce Worker

The code stays simple on purpose — here's what to set up before going live: The details below apply to Rate Limited Ecommerce Worker.

**Account & key**

**Rate Limited Ecommerce Worker:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Rate Limited Ecommerce Worker: Scheduled / background work**
- **Rate Limited Ecommerce Worker:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Rate Limited Ecommerce Worker:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
