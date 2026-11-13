require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("solidity-coverage");
require("dotenv").config({ path: require("node:path").join(__dirname, ".env") });
const { validKey, configurationStatus } = require("./scripts/lib/sepolia");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// A pinned local solc-js makes compilation reproducible after npm ci.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, hre, runSuper) => {
  if (solcVersion === "0.8.28") {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: solcVersion,
      longVersion: require("solc").version(),
    };
  }
  return runSuper();
});

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const accounts = validKey(deployerKey) ? [deployerKey] : [];
const sepoliaRpc = configurationStatus().SEPOLIA_RPC_URL === "configured"
  ? process.env.SEPOLIA_RPC_URL.trim() : "http://127.0.0.1:1";

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    sepolia: {
      // The deployment/preflight commands require an explicitly configured RPC.
      url: sepoliaRpc,
      accounts,
      chainId: 11155111,
    },
  },
  // A single string selects Etherscan API v2 in hardhat-verify 2.1.4.
  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || "" },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
};
