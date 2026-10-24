// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Registre de badges de reussite et de preuves d'integrite de documents.
 *
 * Les REGLES sont ici, sur la blockchain, et non dans le serveur Java :
 *  - seule l'ecole (owner) peut delivrer un badge ou graver une empreinte ;
 *  - un eleve ne peut recevoir qu'UN badge par cours ;
 *  - une empreinte ne peut etre gravee qu'une seule fois (la date reste celle du premier depot).
 * La lecture est publique : n'importe qui peut verifier sans passer par notre serveur.
 */
contract BadgeRegistry {
    /// L'ecole : le compte qui a deploye le contrat.
    address public owner;

    // eleve => (identifiant du cours => date de delivrance en secondes, 0 = pas de badge)
    mapping(address => mapping(uint256 => uint256)) private badgeDates;

    // eleve => nombre de badges recus
    mapping(address => uint256) private badgeTotals;

    // empreinte SHA-256 du document => date de gravure en secondes, 0 = jamais gravee
    mapping(bytes32 => uint256) private documentDates;

    /// Journal public : les applications et Etherscan peuvent relire ces evenements.
    event BadgeIssued(address indexed student, uint256 indexed courseId, string title, uint256 issuedAt);
    event DocumentAnchored(bytes32 indexed documentHash, uint256 anchoredAt);

    /// Controle d'acces : la fonction n'est executee que si l'appelant est l'ecole.
    modifier onlyOwner() {
        require(msg.sender == owner, "Seule l'ecole peut effectuer cette action");
        _;
    }

    constructor() {
        owner = msg.sender; // celui qui deploie le contrat devient l'ecole
    }

    // ---------- Badges ----------

    function issueBadge(address student, uint256 courseId, string calldata title) external onlyOwner {
        require(student != address(0), "Eleve invalide");
        require(badgeDates[student][courseId] == 0, "Badge deja delivre pour ce cours");

        badgeDates[student][courseId] = block.timestamp;
        badgeTotals[student] += 1;
        emit BadgeIssued(student, courseId, title, block.timestamp);
    }

    function hasBadge(address student, uint256 courseId) external view returns (bool) {
        return badgeDates[student][courseId] != 0;
    }

    /// Date de delivrance (secondes depuis 1970), ou 0 si l'eleve n'a pas ce badge.
    function badgeIssuedAt(address student, uint256 courseId) external view returns (uint256) {
        return badgeDates[student][courseId];
    }

    function badgeCount(address student) external view returns (uint256) {
        return badgeTotals[student];
    }

    // ---------- Preuves d'integrite ----------

    /// On ne grave jamais le document, seulement son empreinte (hash) de 32 octets.
    function anchorDocument(bytes32 documentHash) external onlyOwner {
        require(documentDates[documentHash] == 0, "Empreinte deja gravee");

        documentDates[documentHash] = block.timestamp;
        emit DocumentAnchored(documentHash, block.timestamp);
    }

    /// existe = l'empreinte a ete gravee ; anchoredAt = date de gravure (0 si elle n'existe pas).
    function verifyDocument(bytes32 documentHash) external view returns (bool exists, uint256 anchoredAt) {
        anchoredAt = documentDates[documentHash];
        exists = anchoredAt != 0;
    }
}
