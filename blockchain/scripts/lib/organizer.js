const { ethers } = require("ethers");
const {
  DeploymentError, address, transactionPlan, sendPlanned, saveDeployment, confirmedReceipt,
} = require("./sepolia");

async function ensureOrganizer(hre, contract, record, signer, target, settings) {
  target = address(target, "Organizer address");
  const role = await contract.ORGANIZER_ROLE();
  record.organizerGrants ||= {};
  const key = target.toLowerCase();
  if (await contract.hasRole(role, target)) {
    record.organizerGrants[key] = { ...record.organizerGrants[key], address: target, roleVerified: true };
    saveDeployment(record);
    return target;
  }
  if (record.organizerGrants[key]?.transactionHash) {
    throw new DeploymentError("EXISTING_GRANT_TRANSACTION", "An Organizer grant is already recorded. Check its transaction before retrying.");
  }
  if (!await contract.hasRole(ethers.ZeroHash, await signer.getAddress())) {
    throw new DeploymentError("ADMIN_SIGNER_REQUIRED", "The configured deployer is not an Admin and cannot grant Organizer");
  }
  const request = await contract.grantRole.populateTransaction(role, target);
  const plan = await transactionPlan(hre.ethers.provider, signer, request, settings.maxCostWei, hre.network.name);
  const tx = await sendPlanned(hre.ethers.provider, signer, plan, hre.network.name);
  record.organizerGrants[key] = { address: target, transactionHash: tx.hash, status: "submitted" };
  saveDeployment(record);
  const receipt = await confirmedReceipt(tx, settings.confirmations);
  if (!await contract.hasRole(role, target)) throw new DeploymentError("ROLE_CHECK_FAILED", "Confirmed role grant did not activate Organizer");
  record.organizerGrants[key] = {
    address: target, transactionHash: tx.hash, status: "confirmed",
    blockNumber: receipt.blockNumber, roleVerified: true,
  };
  saveDeployment(record);
  console.log("Organizer granted:", target, "| transaction:", tx.hash);
  return target;
}
module.exports = { ensureOrganizer };
