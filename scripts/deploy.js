import { network } from "hardhat";

async function main() {
  console.log("Conectando a la red y desplegando CertificatesUNSCH...");

  // En Hardhat 3, se inicializa la conexión con la red especificada por la terminal (--network)
  const { ethers } = await network.connect();

  const CertificatesUNSCH = await ethers.getContractFactory("CertificatesUNSCH");
  const certificates = await CertificatesUNSCH.deploy();

  await certificates.waitForDeployment();

  console.log(`¡Contrato desplegado con éxito! Dirección: ${await certificates.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});