import assert from "node:assert/strict";
import test from "node:test";
import { WdkPolicySimulationGateway } from "../src/infrastructure/wdk-policy-gateway.js";

const gateway = new WdkPolicySimulationGateway({
  merchantAddress: "0x1111111111111111111111111111111111111111",
  tokenAddress: "0xd077a400968890eacc75cdc901f0356c943e4fdb",
  arsPerUsdt: 1_000,
  maxUsdtInBaseUnits: 25_000_000n,
});

test("WDK permite una intención dentro del límite sin transmitirla", async () => {
  const result = await gateway.evaluate({
    sessionId: "session_1",
    tableNumber: 12,
    paymentMode: "TABLE",
    subtotalInCents: 1_790_000,
    tipInCents: 179_000,
    totalInCents: 1_969_000,
  });
  assert.equal(result.provider, "WDK");
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.broadcast, false);
  assert.equal(result.amountInBaseUnits, "19690000");
});

test("WDK rechaza una intención superior al límite", async () => {
  const result = await gateway.evaluate({
    sessionId: "session_2",
    tableNumber: 8,
    paymentMode: "TABLE",
    subtotalInCents: 3_000_000,
    tipInCents: 0,
    totalInCents: 3_000_000,
  });
  assert.equal(result.provider, "WDK");
  assert.equal(result.decision, "DENY");
  assert.equal(result.matchedRule, "deny-over-limit");
  assert.equal(result.broadcast, false);
});
