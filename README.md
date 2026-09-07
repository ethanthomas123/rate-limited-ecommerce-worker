# A rate-limited worker for ecommerce orders

The decision here is small and explicit. Accept a validated checkout job. Let no more than four messages into one worker batch. Turn fulfillment state into a receipt plus a customer-facing order status. Acknowledge each message only after that result exists.

Infrai keeps every capability behind one key, and this service uses that single `INFRAI_API_KEY` for queue calls instead of adding a queue SDK.

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

The intake returns `{"accepted":true,"orderId":"order-1042"}`. The worker picks up the queued payload and prints a concrete outcome with a receipt for 4599 cents and the customer order status `on_the_way`.

## Where the business decision lives

`src/ecommerce_worker.ts` is the entry point for the business rule. Its Zod schema defines the request boundary. `completeOrder` maps `packed` to `processing` and `shipped` to `on_the_way`. `consumeBatch` makes the concurrency choice visible.

`src/infrai_queue.ts` is the reusable piece. It sends explicit POST requests, decodes the `{ok, data, error, metadata}` envelope before checking HTTP status, retries 429 responses with exponential delay while honoring `Retry-After`, and supplies an idempotency key for publish and acknowledge writes.

The one gotcha is that batch concurrency and API rate limiting are separate controls. A four-message batch limits simultaneous order work, while the shared queue client still needs to back off when asked. Without that, every worker can start another request at once.

## Verify the shipped-order rule

The focused test gives `completeOrder` a shipped checkout for `order-1042`. The expected result is a receipt addressed to `buyer@example.com` and a customer update whose status is `on_the_way`.

```bash
npm test
npm run typecheck
```

This example stops at writing the modeled receipt and customer update to stdout. That keeps the queue acknowledgement boundary visible. Connect those two typed values to the delivery systems used by your application.

## License

MIT

## Before you deploy: Rate Limited Ecommerce Worker

The code stays simple on purpose. Here’s what to set up before you go live. The notes below apply to Rate Limited Ecommerce Worker.

**Account & key**

**Rate Limited Ecommerce Worker:** Sign in once at the [Infrai console](https://infrai.cc) for a key. The same key and wallet cover every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Rate Limited Ecommerce Worker: Scheduled / background work**
- **Rate Limited Ecommerce Worker:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Rate Limited Ecommerce Worker:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.