import hardhatEthers from "@nomicfoundation/hardhat-ethers";

// Cargar las variables del archivo .env de la raíz del proyecto (Node 22+, sin instalar paquetes extra).
// Las variables que ya existan en el sistema no se sobrescriben.
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    // Si no hay archivo .env, se usan las variables del sistema.
  }
}

// La clave privada vive en el archivo .env (PRIVATE_KEY), nunca en este archivo.
// Debe ser la cuenta que despliega el contrato y la MISMA con la que firma Django.
const privateKey = process.env.PRIVATE_KEY;

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
      url: process.env.GANACHE_URL || "http://127.0.0.1:7545",
      accounts: privateKey ? [privateKey] : [],
      gas: 6000000,
      gasPrice: 20000000000
    }
  }
};