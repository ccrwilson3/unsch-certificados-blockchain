// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CertificatesUNSCH {
    address public owner;
    enum Status { NonExistent, Valid, Revoked }
    struct CertificateData {
        bytes32 certHash;
        uint256 issueTimestamp;
        Status status;
    }
    mapping(bytes32 => CertificateData) public certificates;

    event CertificateIssued(bytes32 indexed certHash, uint256 timestamp);
    event CertificateRevoked(bytes32 indexed certHash, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Acceso denegado");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function issueCertificate(bytes32 _certHash) external onlyOwner {
        require(certificates[_certHash].status == Status.NonExistent, "El certificado ya esta registrado");
        certificates[_certHash] = CertificateData({
            certHash: _certHash,
            issueTimestamp: block.timestamp,
            status: Status.Valid
        });
        emit CertificateIssued(_certHash, block.timestamp);
    }

    function verifyCertificate(bytes32 _certHash) external view returns (bool isValid, uint256 issueTimestamp, string memory statusText) {
        CertificateData memory cert = certificates[_certHash];
        if (cert.status == Status.Valid) {
            return (true, cert.issueTimestamp, "VALIDO");
        } else if (cert.status == Status.Revoked) {
            return (false, cert.issueTimestamp, "REVOCADO");
        } else {
            return (false, 0, "NO ENCONTRADO");
        }
    }
}