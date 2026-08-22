import { describe, expect, it } from "vitest";
import { checkoutJobSchema, completeOrder } from "../src/ecommerce_worker.js";

describe("checkout completion", () => {
  it("turns a shipped fulfillment into a receipt and an on-the-way update", () => {
    const job = checkoutJobSchema.parse({
      orderId: "order-1042",
      customerId: "customer-7",
      email: "buyer@example.com",
      amountCents: 4599,
      fulfillment: "shipped"
    });

    expect(completeOrder(job)).toEqual({
      orderId: "order-1042",
      receipt: { recipient: "buyer@example.com", amountCents: 4599 },
      customerUpdate: { customerId: "customer-7", orderStatus: "on_the_way" }
    });
  });
});
