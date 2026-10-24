// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/**
 * Badges de reussite sous forme de NFT (norme ERC-721), NON TRANSFERABLES ("soulbound", ERC-5192).
 *
 * Difference avec BadgeRegistry : ici le badge est un JETON qui appartient a l'eleve. Il apparait dans son
 * portefeuille et sur les outils compatibles ERC-721. Il est cree par l'ecole et ne peut plus changer de main.
 *
 * Les REGLES sont dans le contrat :
 *  - seule l'ecole (owner) peut creer un badge ;
 *  - un eleve ne peut recevoir qu'UN badge par cours ;
 *  - un badge ne peut jamais etre transfere, vendu ni brule.
 * La description du badge (nom, cours, date) est ecrite DANS le contrat : aucun service externe n'est necessaire.
 */
contract BadgeNFT is ERC721 {
    using Strings for uint256;

    struct BadgeInfo {
        uint256 courseId;
        string title;
        uint256 issuedAt;
    }

    /// L'ecole : le compte qui a deploye le contrat.
    address public owner;

    // Les numeros de jeton commencent a 1 : 0 signifie "pas de badge".
    uint256 private _nextTokenId = 1;
    mapping(uint256 => BadgeInfo) private _badges;
    // eleve => (cours => numero du jeton, 0 = pas de badge)
    mapping(address => mapping(uint256 => uint256)) private _tokenOf;

    /// ERC-5192 : annonce qu'un jeton est verrouille (non transferable).
    event Locked(uint256 tokenId);

    uint256 private constant MAX_TITLE_BYTES = 200;

    modifier onlyOwner() {
        require(msg.sender == owner, "Seule l'ecole peut effectuer cette action");
        _;
    }

    constructor() ERC721("Badge de reussite", "BADGE") {
        owner = msg.sender; // celui qui deploie le contrat devient l'ecole
    }

    // ---------- Creation ----------

    function issueBadge(address student, uint256 courseId, string calldata title)
        external
        onlyOwner
        returns (uint256 tokenId)
    {
        require(student != address(0), "Eleve invalide");
        require(_tokenOf[student][courseId] == 0, "Badge deja delivre pour ce cours");
        _requireValidTitle(title);

        tokenId = _nextTokenId++;
        _tokenOf[student][courseId] = tokenId;
        _badges[tokenId] = BadgeInfo(courseId, title, block.timestamp);

        _mint(student, tokenId);
        emit Locked(tokenId);
    }

    // ---------- Lecture ----------

    function hasBadge(address student, uint256 courseId) external view returns (bool) {
        return _tokenOf[student][courseId] != 0;
    }

    /// Numero du jeton de l'eleve pour ce cours, ou 0 s'il n'a pas ce badge.
    function badgeTokenOf(address student, uint256 courseId) external view returns (uint256) {
        return _tokenOf[student][courseId];
    }

    /// Date de delivrance (secondes depuis 1970), ou 0 si l'eleve n'a pas ce badge.
    function badgeIssuedAt(address student, uint256 courseId) external view returns (uint256) {
        uint256 tokenId = _tokenOf[student][courseId];
        return tokenId == 0 ? 0 : _badges[tokenId].issuedAt;
    }

    /// Toujours vrai : les badges ne sont jamais transferables (ERC-5192).
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// Description du badge au format JSON, encodee en base64 : lisible par les portefeuilles et les explorateurs.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        BadgeInfo memory info = _badges[tokenId];
        bytes memory json = abi.encodePacked(
            '{"name":"', info.title,
            '","description":"Badge de reussite delivre par l ecole, non transferable."',
            ',"attributes":[{"trait_type":"Cours","value":', info.courseId.toString(),
            '},{"trait_type":"Delivre le","display_type":"date","value":', info.issuedAt.toString(), '}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId); // 0xb45a3c0e = ERC-5192
    }

    // ---------- Regles internes ----------

    /// Appele par OpenZeppelin a chaque creation, transfert ou destruction : on n'autorise que la creation.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        require(_ownerOf(tokenId) == address(0), "Badge non transferable");
        return super._update(to, tokenId, auth);
    }

    /// Le titre est insere tel quel dans un JSON : on refuse ce qui pourrait le casser (guillemet, antislash, retour a la ligne).
    function _requireValidTitle(string calldata title) private pure {
        bytes calldata raw = bytes(title);
        require(raw.length > 0 && raw.length <= MAX_TITLE_BYTES, "Titre invalide");
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 c = raw[i];
            require(c >= 0x20 && c != 0x22 && c != 0x5c, "Titre invalide");
        }
    }
}
