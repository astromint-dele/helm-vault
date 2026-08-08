require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;

// Order matters: signers[0] is always the deployer/owner wallet, signers[1] is always
// the separate agent wallet. Deploy scripts and execute-trade rely on this ordering.
const accounts = [DEPLOYER_PRIVATE_KEY, AGENT_PRIVATE_KEY].filter(Boolean);

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    xlayerTestnet: {
      url: "https://testrpc.xlayer.tech",
      chainId: 1952,
      accounts,
    },
    xlayerMainnet: {
      url: "https://xlayerrpc.okx.com",
      chainId: 196,
      accounts,
    },
  },
};
