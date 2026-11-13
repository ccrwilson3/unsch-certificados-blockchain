import os
import json
from functools import lru_cache

from dotenv import load_dotenv
from web3 import Web3
from web3.exceptions import ContractLogicError

# Cargar variables del archivo .env ubicado en la raíz del proyecto
load_dotenv()

# Ruta al artefacto generado por Hardhat (npx hardhat compile)
ARTIFACT_PATH = os.path.normpath(os.path.join(
    os.path.dirname(__file__),
    "..", "artifacts", "contracts", "CertificatesUNSCH.sol", "CertificatesUNSCH.json"
))


class BlockchainError(Exception):
    """Error al hablar con la blockchain (conexión, configuración o contrato)."""


@lru_cache(maxsize=1)
def _conexion():
    """
    Crea la conexión la primera vez que se necesita (no al arrancar Django).
    Así el sistema sigue funcionando aunque Ganache esté apagado.
    Devuelve (w3, contract, account, private_key).
    """
    url = os.getenv("GANACHE_URL", "http://127.0.0.1:7545")
    address = os.getenv("CONTRACT_ADDRESS")
    private_key = os.getenv("PRIVATE_KEY")

    if not address or not private_key:
        raise BlockchainError("Faltan CONTRACT_ADDRESS o PRIVATE_KEY en el archivo .env")

    w3 = Web3(Web3.HTTPProvider(url))
    if not w3.is_connected():
        raise BlockchainError(f"No se pudo conectar a la blockchain en {url}. ¿Está abierto Ganache?")

    try:
        with open(ARTIFACT_PATH, "r") as f:
            abi = json.load(f)["abi"]
    except FileNotFoundError:
        raise BlockchainError(
            f"No se encontró el artefacto del contrato en {ARTIFACT_PATH}. "
            "Ejecuta 'npx hardhat compile'."
        )

    contract = w3.eth.contract(address=Web3.to_checksum_address(address), abi=abi)
    account = w3.eth.account.from_key(private_key)
    return w3, contract, account, private_key


def _hash_a_bytes32(certificate_hash):
    """Convierte '0x' + 64 hex (formato de Certificate.certificate_hash) a bytes32."""
    limpio = certificate_hash[2:] if certificate_hash.startswith("0x") else certificate_hash
    try:
        datos = bytes.fromhex(limpio)
    except ValueError:
        raise BlockchainError("El hash del certificado no es hexadecimal válido.")
    if len(datos) != 32:
        raise BlockchainError("El hash del certificado debe tener 32 bytes (64 caracteres hex).")
    return datos


def _enviar_transaccion(funcion_contrato):
    """Construye, firma y envía una transacción. Devuelve el tx hash ('0x...')."""
    w3, _contract, account, private_key = _conexion()

    try:
        # Sin 'gas' fijo: web3 lo estima y, si el contrato rechazaría la operación,
        # lanza aquí el mensaje de error del contrato (ej. "El certificado ya esta registrado").
        txn = funcion_contrato.build_transaction({
            "from": account.address,
            "chainId": w3.eth.chain_id,
            "gasPrice": w3.eth.gas_price,
            "nonce": w3.eth.get_transaction_count(account.address),
        })
    except ContractLogicError as e:
        raise BlockchainError(f"El contrato rechazó la operación: {e}")

    signed = w3.eth.account.sign_transaction(txn, private_key=private_key)
    raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
    tx_hash = w3.eth.send_raw_transaction(raw)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    if receipt.status != 1:
        raise BlockchainError("La transacción fue revertida por la blockchain.")

    return w3.to_hex(tx_hash)


# ==========================================================
# FUNCIONES NUEVAS
# ==========================================================

def emitir_hash_blockchain(certificate_hash):
    """Registra el hash de un certificado en la blockchain. Devuelve el tx hash."""
    _w3, contract, _account, _key = _conexion()
    return _enviar_transaccion(
        contract.functions.issueCertificate(_hash_a_bytes32(certificate_hash))
    )


def revocar_hash_blockchain(certificate_hash):
    """Marca como revocado un certificado ya emitido. Devuelve el tx hash."""
    _w3, contract, _account, _key = _conexion()
    return _enviar_transaccion(
        contract.functions.revokeCertificate(_hash_a_bytes32(certificate_hash))
    )


def consultar_certificado_blockchain(certificate_hash):
    """
    Consulta el estado de un hash en la blockchain.
    Devuelve: {"valido": bool, "fecha_emision": int, "estado": str}
    estado: 'VALIDO', 'REVOCADO', 'NO ENCONTRADO' o 'ERROR_CONSULTA'
    """
    try:
        _w3, contract, _account, _key = _conexion()
        es_valido, timestamp, estado = contract.functions.verifyCertificate(
            _hash_a_bytes32(certificate_hash)
        ).call()
        return {"valido": es_valido, "fecha_emision": timestamp, "estado": estado}
    except Exception as e:
        print(f"Error al consultar la Blockchain: {e}")
        return {"valido": False, "fecha_emision": 0, "estado": "ERROR_CONSULTA"}


# ==========================================================
# COMPATIBILIDAD CON views.py (se eliminan en el paso 4 y 5)
# ==========================================================

def emitir_certificado_blockchain(*args, **kwargs):
    """Función antigua: las vistas actuales todavía la llaman. Su error ya lo capturan."""
    raise BlockchainError("Función antigua. Usar emitir_hash_blockchain(certificate_hash).")


def verificar_certificado_blockchain(certificate_hash):
    """Función antigua que devolvía un booleano. Se mantiene igual para no romper views.py."""
    return consultar_certificado_blockchain(certificate_hash)["valido"]