import assert from "node:assert/strict";
import test from "node:test";
import { WdkCliCheckoutGateway, type CliRunner } from "../src/infrastructure/wdk-cli-checkout-gateway.js";

const client = "0x1111111111111111111111111111111111111111";
const business = "0x2222222222222222222222222222222222222222";

test("un send exitoso no se pierde si falla la lectura de balances posterior", async () => {
  let sent = false;
  const runner: CliRunner = async (args) => {
    if (args[0] === "wallet") return { stdout: JSON.stringify({ wallets: [{ name: "mesa-cliente-demo", unlocked: true }, { name: "mesa-negocio-demo", unlocked: true }] }), stderr: "" };
    if (sent && args[0] === "get") throw new Error("RPC de balance temporalmente caído");
    if (args[0] === "get" && args[1] === "address") {
      const name = args[args.indexOf("--wallet") + 1];
      return { stdout: JSON.stringify({ address: name === "mesa-cliente-demo" ? client : business }), stderr: "" };
    }
    if (args[0] === "get" && args[1] === "balance") return { stdout: JSON.stringify({ balance: "10" }), stderr: "" };
    if (args[0] === "send" && args.includes("--dry-run")) return { stdout: JSON.stringify({ dryRun: true }), stderr: "" };
    if (args[0] === "send") { sent = true; return { stdout: JSON.stringify({ transactionHash: "0xirreversible" }), stderr: "" }; }
    throw new Error("comando no esperado");
  };

  const gateway = new WdkCliCheckoutGateway({ clientWallet: "mesa-cliente-demo", businessWallet: "mesa-negocio-demo", arsPerUsdt: 1_000 }, runner);
  const preview = await gateway.preview(1_000_000);
  const receipt = await gateway.execute(preview.previewId, 1_000_000);

  assert.equal(receipt.broadcast, true);
  assert.equal(receipt.transactionHash, "0xirreversible");
  assert.equal(receipt.balanceAfter.client, null);
  assert.equal(receipt.balanceAfter.business, null);
  await assert.rejects(() => gateway.execute(preview.previewId, 1_000_000), /ya fue utilizado/);
});
