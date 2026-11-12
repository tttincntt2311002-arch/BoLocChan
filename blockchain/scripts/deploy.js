// scripts/deploy.js
// Deploys SBTCertificate to the configured network
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying SBTCertificate with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Deploy
  const SBTCertificate = await hre.ethers.getContractFactory("SBTCertificate");
  const sbt = await SBTCertificate.deploy(deployer.address);
  await sbt.waitForDeployment();

  const contractAddress = await sbt.getAddress();
  console.log("\nSBTCertificate deployed to:", contractAddress);
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", hre.network.config.chainId);

  // ── Save deployment info ──────────────────────────────────────────────────
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    contractAddress,
    deployedAt: new Date().toISOString(),
    deployerAddress: deployer.address,
    transactionHash: sbt.deploymentTransaction()?.hash || "unknown",
  };

  const deployDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });

  const deployFile = path.join(deployDir, `${hre.network.name}.json`);
  fs.writeFileSync(deployFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to:", deployFile);

  // ── Export ABI for frontend & backend ────────────────────────────────────
  await exportABI(contractAddress);

  // ── Verify on Etherscan (Sepolia) ─────────────────────────────────────────
  if (hre.network.name === "sepolia" && process.env.ETHERSCAN_API_KEY) {
    console.log("\nWaiting 30s before Etherscan verification...");
    await new Promise((r) => setTimeout(r, 30000));
    try {
      await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: [deployer.address],
      });
      console.log("Contract verified on Etherscan!");
    } catch (err) {
      console.warn("Etherscan verification failed:", err.message);
    }
  }
}

async function exportABI(contractAddress) {
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/SBTCertificate.sol/SBTCertificate.json"
  );

  if (!fs.existsSync(artifactPath)) {
    console.warn("ABI artifact not found. Run `hardhat compile` first.");
    return;
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const exportData = {
    contractName: "SBTCertificate",
    contractAddress,
    abi: artifact.abi,
    network: hre.network.name,
    exportedAt: new Date().toISOString(),
  };

  // Export paths
  const targets = [
    path.join(__dirname, "../../frontend/src/utils/SBTCertificate.abi.json"),
    path.join(__dirname, "../../backend/app/core/SBTCertificate.abi.json"),
  ];

  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(exportData, null, 2));
    console.log("ABI exported to:", target);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
