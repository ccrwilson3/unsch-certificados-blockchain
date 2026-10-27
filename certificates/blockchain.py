import os
import json
from dotenv import load_dotenv
from web3 import Web3

# Cargar variables del archivo .env ubicado en la raíz del proyecto
load_dotenv()

GANACHE_URL = os.getenv("GANACHE_URL", "http://127.0.0.1:7545")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")

# Inicializar conexión con Web3
w3 = Web3(Web3.HTTPProvider(GANACHE_URL))

if not w3.is_connected():
    raise ConnectionError("No se pudo conectar a la red blockchain de Ganache.")

account = w3.eth.account.from_key(PRIVATE_KEY)

# Ruta al archivo JSON del artefacto generado por Hardhat
# Ajusta la ruta relativa según la ubicación exacta de tu archivo artifacts/
artifact_path = os.path.join(
    os.path.dirname(__file__), 
    "../artifacts/contracts/CertificatesUNSCH.sol/CertificatesUNSCH.json"
)

try:
    with open(artifact_path, "r") as f:
        contract_json = json.load(f)
        CONTRACT_ABI = contract_json["abi"]
except FileNotFoundError:
    raise FileNotFoundError(
        f"No se encontró el artefacto del contrato en: {artifact_path}. "
        "Asegúrate de haber ejecutado 'npx hardhat compile'."
    )

# Instanciar el contrato en Python
contract = w3.eth.contract(
    address=Web3.to_checksum_address(CONTRACT_ADDRESS), 
    abi=CONTRACT_ABI
)

def emitir_certificado_blockchain(estudiante_nombre, curso, codigo_certificado):
    """
    Función para registrar un certificado en la blockchain desde Django.
    """
    nonce = w3.eth.get_transaction_count(account.address)

    # Nota: Asegúrate de que los parámetros coincidan con la función definida en tu CertificatesUNSCH.sol
    txn = contract.functions.emitirCertificado(
        estudiante_nombre, curso, codigo_certificado
    ).build_transaction({
        'chainId': w3.eth.chain_id,
        'gas': 3000000,
        'gasPrice': w3.eth.gas_price,
        'nonce': nonce,
    })

    signed_txn = w3.eth.account.sign_transaction(txn, private_key=PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    
    return receipt

# Agregar a certificates/blockchain.py

def verificar_certificado_blockchain(certificate_hash):
    """
    Consulta en el contrato inteligente si un hash de certificado está registrado y es válido.
    """
    try:
        # Asumiendo que tu contrato CertificatesUNSCH.sol tiene una función de lectura como 'verificarCertificado'
        # o 'obtenerCertificado' que retorna un booleano o la estructura del registro.
        es_valido = contract.functions.verificarCertificado(certificate_hash).call()
        return es_valido
    except Exception as e:
        print(f"Error al consultar la Blockchain: {e}")
        return False