import hardhatEthers from "@nomicfoundation/hardhat-ethers";

export default {
  plugins: [hardhatEthers],
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "paris" // <- Esto evita el opcode PUSH0 incompatible con algunos Ganache
    }
  },
  networks: {
    ganache: {
      type: "http",
      url: "http://127.0.0.1:7545",
      accounts: [
        "0x29e444b74e171f90ce40bbd03fda813a34eab744dead51b5cfe9477b2f0d73b0"
            ],
      gas: 6000000,
      gasPrice: 20000000000
    }
  }
};