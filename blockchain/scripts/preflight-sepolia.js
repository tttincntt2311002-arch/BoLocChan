// Read-only: no transaction is signed or broadcast.
const fs = require("node:fs");
const hre = require("hardhat");
const {
  ROOT, DEPLOYMENT_FILE, configurationStatus, requireEnvironment, address,
  assertSepolia, transactionPlan, safeFailure,
} = require("./lib/sepolia");

async function main() {
  const status = configurationStatus();
  console.log(JSON.stringify({
    envFileExists: fs.existsSync(require("node:path").join(ROOT, ".env")),
    configuration: status, deploymentRecordExists: fs.existsSync(DEPLOYMENT_FILE),
  }, null, 2));
  const settings = requireEnvironment();
  await assertSepolia(hre.ethers.provider, hre.network.name);
  const [deployer] = await hre.ethers.getSigners();
  const initialAdmin = address(process.env.INITIAL_ADMIN_ADDRESS || deployer.address, "INITIAL_ADMIN_ADDRESS");
  const factory = await hre.ethers.getContractFactory("SoulboundCertificate", deployer);
  const request = await factory.getDeployTransaction(initialAdmin);
  const plan = await transactionPlan(hre.ethers.provider, deployer, request, settings.maxCostWei, hre.network.name);
  console.log(JSON.stringify({ status: "ready", chainId: 11155111, initialAdmin, ...plan.summary, transactionSent: false }, null, 2));
}

if (require.main === module) main().catch(safeFailure);
module.exports = { main };
