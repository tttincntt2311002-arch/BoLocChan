const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");
const { exportAbi } = require("./exportAbi");

async function main() {
  if (hre.network.name === "sepolia") return require("./deploy-sepolia").main();
  if (!["hardhat", "localhost"].includes(hre.network.name)) {
    throw new Error("Deployment is allowed only on local Hardhat or Ethereum Sepolia");
  }
  if (Number((await hre.ethers.provider.getNetwork()).chainId) !== 31337) {
    throw new Error("Local deployment requires chain ID 31337");
  }
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No deployer configured. Set DEPLOYER_PRIVATE_KEY in the local .env for Sepolia.");
  const initialAdmin = process.env.INITIAL_ADMIN_ADDRESS || deployer.address;
  if (!hre.ethers.isAddress(initialAdmin) || initialAdmin === hre.ethers.ZeroAddress) {
    throw new Error("INITIAL_ADMIN_ADDRESS must be a nonzero Ethereum address");
  }
  const organizer = process.env.INITIAL_ORGANIZER_ADDRESS;
  if (organizer && (!hre.ethers.isAddress(organizer) || organizer === hre.ethers.ZeroAddress)) {
    throw new Error("INITIAL_ORGANIZER_ADDRESS must be a nonzero Ethereum address");
  }
  if (organizer && initialAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("When admin differs from deployer, that admin must grant ORGANIZER_ROLE after deployment");
  }

  console.log("Deploying SoulboundCertificate on", hre.network.name, "from", deployer.address);
  const certificate = await hre.ethers.deployContract("SoulboundCertificate", [initialAdmin]);
  await certificate.waitForDeployment();
  const receipt = await certificate.deploymentTransaction().wait();
  const address = await certificate.getAddress();
  if (organizer) {
    await (await certificate.grantRole(await certificate.ORGANIZER_ROLE(), organizer)).wait();
  }

  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  const deployment = {
    contractName: "SoulboundCertificate", network: hre.network.name, chainId,
    contractAddress: address, adminAddress: initialAdmin,
    organizerAddress: organizer || null, deployerAddress: deployer.address,
    transactionHash: receipt.hash, blockNumber: receipt.blockNumber,
    compiler: require("solc").version(),
  };
  const directory = path.join(__dirname, "../deployments");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, hre.network.name + ".json"), JSON.stringify(deployment, null, 2) + "\n");
  console.log("Contract:", address);
  console.log("Admin:", initialAdmin, "| Organizer:", organizer || "(grant separately)");
  // The in-process hardhat network disappears when this command exits.
  exportAbi({
    contractAddress: hre.network.name === "hardhat" ? null : address,
    network: hre.network.name === "hardhat" ? null : hre.network.name,
    chainId: hre.network.name === "hardhat" ? null : chainId,
  });
}

if (require.main === module) main().catch(require("./lib/sepolia").safeFailure);
module.exports = { main };
