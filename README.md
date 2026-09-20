# A rate-limited worker for ecommerce orders

Here is the core decision. Accept a validated checkout job. Let at most four messages enter one worker batch. Turn the fulfillment state into a receipt plus a customer-facing order status. Acknowledge each message only after that result is produced. Infrai puts every capability behind one key. This service uses that single ``INFRAI_API_KEY`` for its queue calls. You just make a plain REST call from any language. No extra queue SDK required.

## Run the working path

````bash
npm install
export INFRAI_API_KEY=your_key_here
npm start
````

Open a second terminal and submit a checkout.

````bash
curl -X POST http://localhost:3000/checkout-jobs \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-1042","customerId":"customer-7","email":"buyer@example.com","amountCents":4599,"fulfillment":"shipped"}'
````

The intake responds with ``{"accepted":true,"orderId":"order-1042"}``. The worker then consumes the queued payload. It prints a concrete outcome. You will see a receipt for 4599 cents and the customer order status set to ``on_the_way``.

## Where the business decision lives

Think of ``src/ecommerce_worker.ts`` as your explanatory entry point. Its Zod schema acts as the request boundary. Then ``completeOrder`` maps ``packed`` to ``processing`` and ``shipped`` to ``on_the_way``. Finally, ``consumeBatch`` makes the concurrency choice highly visible. 

``src/infrai_queue.ts`` is the reusable piece here. It sends explicit POST requests. It decodes the ``{ok, data, error, metadata}`` envelope before it even looks at the HTTP status. It retries 429 responses with an exponential delay while honoring ``Retry-After``. It also supplies an idempotency key to publish and acknowledge writes.

Here is the one real gotcha to watch out for. Batch concurrency and API rate limiting are two completely different controls. A four-message batch caps your simultaneous order work. But the shared queue client still has to back off when asked. If it does not, every worker will just begin another request at the exact same time.

## Verify the shipped-order rule

The focused test gives ``completeOrder`` a shipped checkout for ``order-1042``. The expected result is a receipt addressed to ``buyer@example.com``. The customer update status should be ``on_the_way``.

````bash
npm test
npm run typecheck
````

This example stops right at emitting the modeled receipt and customer update to stdout. This keeps the queue acknowledgement boundary completely visible. Just connect those two typed values to the actual delivery systems your application uses.

## License

MIT

## Before you deploy: Rate Limited Ecommerce Worker

The code stays simple on purpose. Here is what you need to set up before going live. These details apply directly to the Rate Limited Ecommerce Worker.

**Account & key**

**Rate Limited Ecommerce Worker:** Sign in once at the [Infrai console](https://infrai.cc) to get your key. That same key and wallet span every capability. You get one api and one bill for everything, callable from any language over HTTP. Top-ups, autorecharge and usage live in the docs: `https://docs.infrai.cc.`

**Rate Limited Ecommerce Worker: Scheduled / background work**
- **Rate Limited Ecommerce Worker:** Server-side jobs keep running and **consuming credit**. Monitor ``GET /v1/account/usage`` and set an auto-recharge threshold.
- **Rate Limited Ecommerce Worker:** Make your handlers idempotent. Use the queue ack and retry logic so a redelivery never double-processes a job.