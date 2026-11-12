// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SBTCertificate
 * @dev Soulbound Token (SBT) for extracurricular activity certificates.
 *      Implements ERC-5192 (Minimal Soulbound NFTs) – tokens are locked
 *      (non-transferable) immediately after minting.
 *
 *      References:
 *        - ERC-721: https://eips.ethereum.org/EIPS/eip-721
 *        - ERC-5192: https://eips.ethereum.org/EIPS/eip-5192
 *        - OpenZeppelin v5: https://docs.openzeppelin.com/contracts/5.x/
 */
contract SBTCertificate is ERC721, ERC721URIStorage, AccessControl {
    // ─── ERC-5192 ────────────────────────────────────────────────────────────
    /// @dev Emitted when the locking status of a token changes.
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    // ─── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN_ROLE");

    // ─── State ────────────────────────────────────────────────────────────────
    uint256 private _nextTokenId;

    /// @dev tokenId => locked status (always true for SBT)
    mapping(uint256 => bool) private _locked;

    /// @dev tokenId => event metadata (stored on-chain for verification)
    struct CertificateData {
        string  eventId;      // Backend event UUID
        string  eventName;    // Human-readable event name
        address recipient;    // Original recipient address
        uint256 issuedAt;     // Block timestamp at mint
        bool    revoked;      // Whether certificate has been revoked
    }
    mapping(uint256 => CertificateData) private _certificates;

    // ─── Events ───────────────────────────────────────────────────────────────
    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        string  indexed eventId,
        string  tokenURI,
        uint256 issuedAt
    );
    event CertificateRevoked(uint256 indexed tokenId, address indexed revokedBy);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address defaultAdmin) ERC721("SBT Certificate", "SBTC") {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, defaultAdmin);
    }

    // ─── Minting ─────────────────────────────────────────────────────────────
    /**
     * @notice Mint a Soulbound Certificate to a recipient.
     * @param to          Wallet address of the certificate recipient.
     * @param uri         IPFS URI pointing to certificate metadata JSON.
     * @param eventId     Unique event identifier (from backend).
     * @param eventName   Human-readable name of the event.
     */
    function mintCertificate(
        address to,
        string calldata uri,
        string calldata eventId,
        string calldata eventName
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        uint256 tokenId = _nextTokenId++;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        _locked[tokenId] = true;
        _certificates[tokenId] = CertificateData({
            eventId:   eventId,
            eventName: eventName,
            recipient: to,
            issuedAt:  block.timestamp,
            revoked:   false
        });

        // ERC-5192: emit Locked immediately after minting
        emit Locked(tokenId);
        emit CertificateMinted(tokenId, to, eventId, uri, block.timestamp);

        return tokenId;
    }

    // ─── Revocation ───────────────────────────────────────────────────────────
    /**
     * @notice Revoke a certificate (marks on-chain, token still exists).
     * @param tokenId Token to revoke.
     */
    function revokeCertificate(uint256 tokenId) external onlyRole(ADMIN_ROLE) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(!_certificates[tokenId].revoked, "Already revoked");
        _certificates[tokenId].revoked = true;
        emit CertificateRevoked(tokenId, msg.sender);
    }

    // ─── ERC-5192: Locking ────────────────────────────────────────────────────
    /**
     * @notice Returns whether a token is locked (non-transferable).
     *         All SBT certificates are always locked.
     */
    function locked(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _locked[tokenId];
    }

    // ─── View helpers ─────────────────────────────────────────────────────────
    function getCertificate(uint256 tokenId)
        external
        view
        returns (CertificateData memory)
    {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _certificates[tokenId];
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    // ─── SBT: Block transfers ─────────────────────────────────────────────────
    /**
     * @dev Override _update to prevent transfers (SBT behaviour).
     *      Minting (from == address(0)) is allowed.
     *      Burning (to == address(0)) is allowed for admin.
     *      All other transfers are blocked.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721) returns (address) {
        address from = _ownerOf(tokenId);
        require(
            from == address(0) || to == address(0),
            "SBT: token is non-transferable"
        );
        return super._update(to, tokenId, auth);
    }

    // ─── Required overrides (ERC721 + ERC721URIStorage) ──────────────────────
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        // ERC-5192 interface id: bytes4(keccak256("locked(uint256)"))
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId);
    }
}
