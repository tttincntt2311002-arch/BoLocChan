const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  CHAIN_ID, configurationStatus, requireEnvironment, assertSepolia,
  transactionPlan, sendPlanned, DeploymentError,
} = require("../scripts/lib/sepolia");

describe("Sepolia deployment guards (no public transactions)", function () {
  const account = "0x1111111111111111111111111111111111111111";
  const signer = { getAddress: async () => account };
  function provider(chainId = CHAIN_ID, balance = ethers.parseEther("1")) {
    return {
      send: async () => ethers.toQuantity(chainId),
      estimateGas: async () => 100000n,
      getFeeData: async () => ({ maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n }),
      getBalance: async () => balance,
    };
  }
  async function rejectsCode(promise, expected) {
    try { await promise; expect.fail("Expected a deployment guard error"); }
    catch (error) { expect(error).to.be.instanceOf(DeploymentError); expect(error.code).to.equal(expected); }
  }

  it("reports missing configuration without generating or revealing a key", function () {
    const status = configurationStatus({});
    expect(status.SEPOLIA_RPC_URL).to.equal("missing");
    expect(status.DEPLOYER_PRIVATE_KEY).to.equal("missing");
    expect(() => requireEnvironment({ env: {} })).to.throw("SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY");
  });

  it("does not echo invalid RPC credentials or key text in diagnostics", function () {
    const env = { SEPOLIA_RPC_URL: "not-a-url-with-sensitive-fragment", DEPLOYER_PRIVATE_KEY: "invalid-do-not-print-me" };
    expect(configurationStatus(env).SEPOLIA_RPC_URL).to.equal("invalid");
    expect(configurationStatus(env).DEPLOYER_PRIVATE_KEY).to.equal("invalid");
    try { requireEnvironment({ env }); expect.fail("Expected validation failure"); }
    catch (error) {
      expect(error.message).not.to.include(env.SEPOLIA_RPC_URL);
      expect(error.message).not.to.include(env.DEPLOYER_PRIVATE_KEY);
    }
  });

  it("allows read-only commands without a private key", function () {
    const settings = requireEnvironment({ requireKey: false, env: { SEPOLIA_RPC_URL: "https://rpc.example.com" } });
    expect(settings.confirmations).to.equal(2);
  });

  it("rejects an RPC that actually serves Mainnet", async function () {
    await rejectsCode(assertSepolia(provider(1), "sepolia"), "WRONG_CHAIN");
  });

  it("rejects a non-Sepolia network name even if its RPC claims Sepolia", async function () {
    await rejectsCode(assertSepolia(provider(), "mainnet"), "WRONG_NETWORK");
  });

  it("checks the actual chain before gas estimation or balance queries", async function () {
    const rpc = provider(1);
    rpc.estimateGas = async () => { throw new Error("Must not estimate"); };
    await rejectsCode(transactionPlan(rpc, signer, {}, ethers.parseEther("1")), "WRONG_CHAIN");
  });

  it("blocks an unfunded signer before any broadcast", async function () {
    await rejectsCode(transactionPlan(provider(CHAIN_ID, 0n), signer, {}, ethers.parseEther("1")), "INSUFFICIENT_SEPOLIA_ETH");
  });

  it("enforces the per-transaction cost ceiling", async function () {
    await rejectsCode(transactionPlan(provider(), signer, {}, 1n), "COST_LIMIT");
  });

  it("adds a gas buffer, checks the balance and fixes the signed chain ID", async function () {
    const plan = await transactionPlan(provider(), signer, { data: "0x1234" }, ethers.parseEther("1"));
    expect(plan.request.gasLimit).to.equal(120000n);
    expect(plan.request.maxFeePerGas).to.equal(2000000000n);
    expect(plan.request.chainId).to.equal(CHAIN_ID);
    expect(plan.summary.balanceSepoliaETH).to.equal("1.0");
  });

  it("never sends ETH value to another account", async function () {
    await rejectsCode(transactionPlan(provider(), signer, { value: 1n }, ethers.parseEther("1")), "VALUE_FORBIDDEN");
  });

  it("rechecks RPC chain immediately before broadcasting", async function () {
    const plan = await transactionPlan(provider(), signer, {}, ethers.parseEther("1"));
    let signed = false;
    const writer = { sendTransaction: async () => { signed = true; } };
    await rejectsCode(sendPlanned(provider(1), writer, plan), "WRONG_CHAIN");
    expect(signed).to.equal(false);
  });
});
