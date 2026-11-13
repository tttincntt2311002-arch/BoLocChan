const hre = require("hardhat");
const {
  DeploymentError, requireEnvironment, loadDeployment, inspectContract, saveDeployment, safeFailure,
} = require("./lib/sepolia");

async function main() {
  requireEnvironment({ requireKey: false });
  if (!process.env.ETHERSCAN_API_KEY?.trim()) {
    throw new DeploymentError("MISSING_ETHERSCAN_KEY", "Set ETHERSCAN_API_KEY locally in blockchain/.env to verify source code");
  }
  const record = loadDeployment();
  await inspectContract(hre, record);
  try {
    await hre.run("verify:verify", {
      address: record.contractAddress,
      constructorArguments: record.constructorArguments,
      contract: "contracts/SoulboundCertificate.sol:SoulboundCertificate",
    });
  } catch (error) {
    if (!error.message?.toLowerCase().includes("already verified")) throw error;
  }
  record.etherscanVerified = true;
  record.verifiedAt = new Date().toISOString();
  saveDeployment(record);
  console.log("Verified source:", record.explorerUrl + "#code");
}
if (require.main === module) main().catch(safeFailure);
module.exports = { main };
