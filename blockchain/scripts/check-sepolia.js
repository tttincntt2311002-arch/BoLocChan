// Public RPC reads only: a deployer key is not required.
const hre = require("hardhat");
const {
  requireEnvironment, loadDeployment, inspectContract, saveDeployment, safeFailure,
} = require("./lib/sepolia");

async function main() {
  requireEnvironment({ requireKey: false });
  const record = loadDeployment();
  const { checks } = await inspectContract(hre, record);
  record.readChecks = checks;
  record.lastCheckedAt = new Date().toISOString();
  saveDeployment(record);
  console.log(JSON.stringify(checks, null, 2));
}
if (require.main === module) main().catch(safeFailure);
module.exports = { main };
