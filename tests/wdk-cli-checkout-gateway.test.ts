import assert from "node:assert/strict";
import test from "node:test";
import { WdkCliCheckoutGateway, type CliRunner } from "../src/infrastructure/wdk-cli-checkout-gateway.js";

const clientAddress = "0x1111111111111111111111111111111111111111";
const businessAddress = "0x2222222222222222222222222222222222222222";

function fakeRunner(log: string[][]): CliRunner {
  let balanceReads = 0;
  return async (args) => {
    log.push(args);
    if (args[0] === "wallet" && args[1] === "list") return { stdout: JSON.stringify({ wallets: [{ name: "mesa-cliente-demo", unlocked: true }, { name: "mesa-negocio-demo", unlocked: true }] }), stderr: "" };
    if (args[0] === "get" && args[1] === "address") {
      const wallet = args[args.indexOf("--wallet") + 1];
      return { stdout: JSON.stringify({ address: wallet === "mesa-cliente-demo" ? clientAddress : businessAddress }), stderr: "" };
    }
    if (args[0] === "get" && args[1] === "balance") {
      const wallet = args[args.indexOf("--wallet") + 1];
      balanceReads += 1;
      const afterBroadcast = balanceReads > 2;
      const balance = wallet === "mesa-cliente-demo" ? (afterBroadcast ? "79" : "100") : (afterBroadcast ? "31" : "10");
      return { stdout: JSON.stringify({ balance }), stderr: "" };
    }
    if (args[0] === "send" && args.includes("--dry-run")) return { stdout: JSON.stringify({ dryRun: true, fee: "0.001" }), stderr: "" };
    if (args[0] === "send") return { stdout: JSON.stringify({ transactionHash: "0xabc123" }), stderr: "" };
    throw new Error(`Comando falso no contemplado: ${args.join(" ")}`);
  };
}

test("WDK CLI previsualiza antes de transmitir y mueve cliente hacia negocio", async () => {
  const calls: string[][] = [];
  const gateway = new WdkCliCheckoutGateway({ clientWallet: "mesa-cliente-demo", businessWallet: "mesa-negocio-demo", arsPerUsdt: 1_000 }, fakeRunner(calls));
  const preview = await gateway.preview(2_100_000);

  assert.equal(preview.amount, "21");
  assert.equal(preview.fromAddress, clientAddress);
  assert.equal(preview.toAddress, businessAddress);
  assert.equal(preview.dryRun, true);
  assert.ok(calls.some((args) => args[0] === "send" && args.includes("--dry-run")));

  const receipt = await gateway.execute(preview.previewId, 2_100_000);
  assert.equal(receipt.broadcast, true);
  assert.equal(receipt.transactionHash, "0xabc123");
  assert.equal(receipt.balanceBefore.client, "100");
  assert.equal(receipt.balanceAfter.client, "79");
  assert.equal(receipt.balanceBefore.business, "10");
  assert.equal(receipt.balanceAfter.business, "31");
  assert.ok(calls.some((args) => args[0] === "send" && !args.includes("--dry-run")));
});

test("un preview WDK CLI no puede transmitirse dos veces", async () => {
  const gateway = new WdkCliCheckoutGateway({ clientWallet: "mesa-cliente-demo", businessWallet: "mesa-negocio-demo", arsPerUsdt: 1_000 }, fakeRunner([]));
  const preview = await gateway.preview(500_000);
  await gateway.execute(preview.previewId, 500_000);
  await assert.rejects(() => gateway.execute(preview.previewId, 500_000), /ya fue utilizado/);
});

test("si cambia el monto después del preview, WDK CLI bloquea el envío", async () => {
  const gateway = new WdkCliCheckoutGateway({ clientWallet: "mesa-cliente-demo", businessWallet: "mesa-negocio-demo", arsPerUsdt: 1_000 }, fakeRunner([]));
  const preview = await gateway.preview(500_000);
  await assert.rejects(() => gateway.execute(preview.previewId, 600_000), /El monto cambió/);
});
