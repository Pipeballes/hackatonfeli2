import { spawnSync } from "node:child_process";

const client = process.env.WDK_CLIENT_WALLET || "mesa-cliente-demo";
const business = process.env.WDK_BUSINESS_WALLET || "mesa-negocio-demo";
const executable = process.env.WDK_CLI_BIN || "wdk";

console.log("\nMesa Abierta · WDK CLI wallet setup");
console.log("----------------------------------");
console.log("Se crearán DOS wallets dedicadas exclusivamente a Sepolia/testnet:");
console.log(`  cliente : ${client}`);
console.log(`  negocio : ${business}`);
console.log("\nIMPORTANTE: guardá cada seed phrase offline. No la pegues en GitHub, .env, logs, chats ni capturas.\n");

run(["--version"]);
create(client);
create(business);

console.log("\nWallets creadas. Antes de la demo desbloquealas por 5 minutos:");
console.log(`  ${executable} wallet unlock --name ${client} --ttl 5`);
console.log(`  ${executable} wallet unlock --name ${business} --ttl 5`);
console.log("\nDespués verificá direcciones y saldos en Sepolia:");
console.log(`  ${executable} get address --network sepolia --wallet ${client}`);
console.log(`  ${executable} get address --network sepolia --wallet ${business}`);
console.log(`  ${executable} get balance --network sepolia --token usdt --wallet ${client}`);
console.log("\nNo uses wallets personales ni mainnet para esta demo.\n");

function create(name) {
  console.log(`\nCreando wallet ${name}...`);
  const result = spawnSync(executable, ["wallet", "create", "--name", name, "--words", "12"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    console.error(`No se pudo ejecutar ${executable}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`No se pudo crear ${name}. Si ya existe, no la borres: verificá con '${executable} wallet list'.`);
    process.exit(result.status ?? 1);
  }
}

function run(args) {
  const result = spawnSync(executable, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error || result.status !== 0) {
    console.error("WDK CLI no está disponible. Instalalo antes de crear las wallets.");
    process.exit(1);
  }
}
