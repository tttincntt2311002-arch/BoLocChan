// State-changing test: explicitly run after a confirmed Sepolia deployment.
const hre = require("hardhat");
const {
  CHAIN_ID, DeploymentError, requireEnvironment, address, loadDeployment, inspectContract,
  transactionPlan, sendPlanned, saveDeployment, confirmedReceipt, safeFailure,
} = require("./lib/sepolia");
const { ensureOrganizer } = require("./lib/organizer");

async function main() {
  const settings = requireEnvironment();
  const record = loadDeployment();
  if (record.status !== "confirmed") throw new DeploymentError("DEPLOYMENT_NOT_CONFIRMED", "Confirm the deployment transaction before smoke testing");
  const { contract } = await inspectContract(hre, record);
  const [signer] = await hre.ethers.getSigners();
  const organizer = await signer.getAddress();
  const recipient = address(process.env.SMOKE_RECIPIENT_ADDRESS || organizer, "SMOKE_RECIPIENT_ADDRESS");
  if (record.smokeTest && record.smokeTest.recipient.toLowerCase() !== recipient.toLowerCase()) {
    throw new DeploymentError("EXISTING_SMOKE_RECIPIENT", "A smoke test for a different recipient is already recorded; no additional token was minted");
  }
  const eventId = "sepolia-smoke:" + record.contractAddress.toLowerCase() + ":" + recipient.toLowerCase();
  const metadata = JSON.stringify({
    name: "SoulPass Sepolia Deployment Test",
    description: "Test certificate for deployment verification; not an activity participation claim.",
    chainId: CHAIN_ID, eventId, recipient: recipient.toLowerCase(),
  });
  const uri = process.env.SMOKE_METADATA_URI || "data:application/json;base64," + Buffer.from(metadata).toString("base64");
  if (Buffer.byteLength(uri) > 2048 || uri.trim() !== uri || uri.length === 0) {
    throw new DeploymentError("INVALID_METADATA", "SMOKE_METADATA_URI must be 1-2048 bytes without surrounding whitespace");
  }
  const certificateHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(metadata));
  await ensureOrganizer(hre, contract, record, signer, organizer, settings);

  let mintStatus = "existing_certificate_verified";
  if (!await contract.hasCertificate(recipient, eventId)) {
    if (record.smokeTest?.mintTransactionHash) {
      throw new DeploymentError("EXISTING_MINT_TRANSACTION", "A test mint is already recorded. Check its transaction before retrying.");
    }
    const request = await contract.mintCertificate.populateTransaction(recipient, eventId, uri, certificateHash);
    const plan = await transactionPlan(hre.ethers.provider, signer, request, settings.maxCostWei, hre.network.name);
    const tx = await sendPlanned(hre.ethers.provider, signer, plan, hre.network.name);
    record.smokeTest = {
      recipient, organizer, eventId, tokenURI: uri, certificateHash,
      status: "submitted", mintTransactionHash: tx.hash,
    };
    saveDeployment(record);
    const receipt = await confirmedReceipt(tx, settings.confirmations);
    record.smokeTest.blockNumber = receipt.blockNumber;
    mintStatus = "mint_transaction_confirmed";
  }
  const tokenId = await contract.certificateTokenId(recipient, eventId);
  const data = await contract.getCertificate(tokenId);
  const checks = {
    ownerMatches: (await contract.ownerOf(tokenId)).toLowerCase() === recipient.toLowerCase(),
    locked: await contract.locked(tokenId),
    valid: await contract.verifyCertificate(tokenId),
    revoked: await contract.isRevoked(tokenId),
    uriMatches: await contract.tokenURI(tokenId) === uri,
    hashMatches: data.certificateHash === certificateHash,
    issuerMatches: data.issuer.toLowerCase() === organizer.toLowerCase(),
  };
  if (!checks.ownerMatches || !checks.locked || !checks.valid || checks.revoked ||
      !checks.uriMatches || !checks.hashMatches || !checks.issuerMatches) {
    throw new DeploymentError("SMOKE_CHECK_FAILED", "Test certificate read checks failed");
  }
  record.smokeTest = {
    ...record.smokeTest, recipient, organizer, eventId, tokenURI: uri, certificateHash,
    status: "verified", tokenId: tokenId.toString(), checks, checkedAt: new Date().toISOString(),
  };
  saveDeployment(record);
  console.log(JSON.stringify({
    chainId: CHAIN_ID, contractAddress: record.contractAddress, mintStatus,
    tokenId: tokenId.toString(), recipient, organizer,
    mintTransactionHash: record.smokeTest.mintTransactionHash || null, checks,
  }, null, 2));
}
if (require.main === module) main().catch(safeFailure);
module.exports = { main };
