import assert from "node:assert/strict";
import test from "node:test";
import type { PaymentGateway } from "../src/application/payment-gateway.js";
import { ResilientPaymentGateway, SimulatedFallbackGateway } from "../src/infrastructure/wdk-policy-gateway.js";

const failingPrimary: PaymentGateway = {
  async evaluate() { throw new Error("WDK unavailable"); },
};

test("el checkout transmisible nunca usa ALLOW del fallback si WDK falla", async () => {
  const gateway = new ResilientPaymentGateway(failingPrimary, new SimulatedFallbackGateway());
  const result = await gateway.evaluate({
    sessionId: "session_1",
    tableNumber: 12,
    paymentMode: "INDIVIDUAL",
    dinerId: "diner_1",
    subtotalInCents: 1_000_000,
    tipInCents: 100_000,
    totalInCents: 1_100_000,
    recipientAddress: "0x2222222222222222222222222222222222222222",
  });
  assert.equal(result.provider, "SIMULATED_FALLBACK");
  assert.equal(result.decision, "DENY");
  assert.equal(result.matchedRule, "deny-wdk-unavailable");
  assert.equal(result.broadcast, false);
});
