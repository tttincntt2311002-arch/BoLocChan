const fs = require("node:fs");
const hre = require("hardhat");
const { exportAbi } = require("./exportAbi");
const { ensureOrganizer } = require("./lib/organizer");
const {
  CHAIN_ID, DEPLOYMENT_FILE, DeploymentError, requireEnvironment, address,
  assertSepolia, transactionPlan, sendPlanned, saveDeployment, loadDeployment,
  inspectContract, confirmedReceipt, safeFailure,
} = require("./lib/sepolia");

async function main() {
  const settings = requireEnvironment();
  await assertSepolia(hre.ethers.provider, hre.network.name);
  if (fs.existsSync(DEPLOYMENT_FILE)) {
    const existing = loadDeployment();
    if (existing.status !== "confirmed") {
      const receipt = await hre.ethers.provider.getTransactionReceipt(existing.transactionHash);
      if (!receipt || receipt.status !== 1 || await receipt.confirmations() < settings.confirmations) {
        throw new DeploymentError("EXISTING_TRANSACTION", "A Sepolia deployment is already recorded and is not confirmed successfully. Check its transaction before retrying; no second contract was deployed.");
      }
      if (receipt.contractAddress?.toLowerCase() !== existing.contractAddress.toLowerCase() ||
          receipt.from.toLowerCase() !== existing.deployerAddress.toLowerCase()) {
        throw new DeploymentError("ADDRESS_MISMATCH", "Recorded deployment does not match its actual receipt");
      }
      existing.status = "confirmed";
      existing.blockNumber = receipt.blockNumber;
      existing.blockHash = receipt.blockHash;
      existing.gasUsed = receipt.gasUsed.toString();
      existing.gasPriceWei = receipt.gasPrice.toString();
      existing.costSepoliaETH = hre.ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
      existing.confirmedAt = new Date().toISOString();
      saveDeployment(existing);
    }
    const { checks } = await inspectContract(hre, existing);
    if (process.env.INITIAL_ORGANIZER_ADDRESS) {
      const [signer] = await hre.ethers.getSigners();
      const contract = await hre.ethers.getContractAt("SoulboundCertificate", existing.contractAddress);
      await ensureOrganizer(hre, contract, existing, signer, process.env.INITIAL_ORGANIZER_ADDRESS, settings);
    }
    exportAbi({ contractAddress: existing.contractAddress, network: "sepolia", chainId: CHAIN_ID });
    console.log(JSON.stringify({ status: "existing_deployment_reused", ...checks }, null, 2));
    return existing;
  }

  const [deployer] = await hre.ethers.getSigners();
  const initialAdmin = address(process.env.INITIAL_ADMIN_ADDRESS || deployer.address, "INITIAL_ADMIN_ADDRESS");
  if (process.env.INITIAL_ORGANIZER_ADDRESS) {
    address(process.env.INITIAL_ORGANIZER_ADDRESS, "INITIAL_ORGANIZER_ADDRESS");
    if (initialAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new DeploymentError("ADMIN_SIGNER_REQUIRED", "When granting an initial Organizer, the deployer must also be initial Admin");
    }
  }
  const factory = await hre.ethers.getContractFactory("SoulboundCertificate", deployer);
  const request = await factory.getDeployTransaction(initialAdmin);
  const plan = await transactionPlan(hre.ethers.provider, deployer, request, settings.maxCostWei, hre.network.name);
  console.log(JSON.stringify({ phase: "preflight", chainId: CHAIN_ID, adminAddress: initialAdmin, ...plan.summary }, null, 2));
  const tx = await sendPlanned(hre.ethers.provider, deployer, plan, hre.network.name);
  const contractAddress = hre.ethers.getCreateAddress({ from: deployer.address, nonce: tx.nonce });
  const buildInfo = await hre.artifacts.getBuildInfo("contracts/SoulboundCertificate.sol:SoulboundCertificate");
  const record = {
    contractName: "SoulboundCertificate", network: "sepolia", chainId: CHAIN_ID,
    status: "submitted", contractAddress, adminAddress: initialAdmin,
    deployerAddress: deployer.address, constructorArguments: [initialAdmin],
    transactionHash: tx.hash, nonce: tx.nonce, blockNumber: null,
    submittedAt: new Date().toISOString(),
    compiler: require("solc").version(), compilerSettings: buildInfo.input.settings,
    explorerUrl: "https://sepolia.etherscan.io/address/" + contractAddress,
    transactionUrl: "https://sepolia.etherscan.io/tx/" + tx.hash,
    preflight: plan.summary,
  };
  // Record the broadcast before waiting or performing any follow-up operation.
  saveDeployment(record);
  console.log("Deployment transaction:", tx.hash);
  const receipt = await confirmedReceipt(tx, settings.confirmations);
  if (receipt.contractAddress?.toLowerCase() !== contractAddress.toLowerCase()) {
    throw new DeploymentError("ADDRESS_MISMATCH", "Receipt contract address differs from the predicted deployment address");
  }
  record.status = "confirmed";
  record.blockNumber = receipt.blockNumber;
  record.blockHash = receipt.blockHash;
  record.gasUsed = receipt.gasUsed.toString();
  record.gasPriceWei = receipt.gasPrice.toString();
  record.costSepoliaETH = hre.ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
  record.confirmedAt = new Date().toISOString();
  saveDeployment(record);
  const { checks } = await inspectContract(hre, record);
  record.readChecks = checks;
  saveDeployment(record);
  exportAbi({ contractAddress, network: "sepolia", chainId: CHAIN_ID });
  if (process.env.INITIAL_ORGANIZER_ADDRESS) {
    const contract = await hre.ethers.getContractAt("SoulboundCertificate", contractAddress);
    await ensureOrganizer(hre, contract, record, deployer, process.env.INITIAL_ORGANIZER_ADDRESS, settings);
  }
  console.log(JSON.stringify({ status: "confirmed", ...checks, transactionHash: tx.hash, explorerUrl: record.explorerUrl }, null, 2));
  return record;
}

if (require.main === module) main().catch(safeFailure);
module.exports = { main };
