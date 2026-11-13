// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC721Utils} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Utils.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC5192} from "./IERC5192.sol";

/// @title SoulboundCertificate
/// @notice Permanently locked activity certificates. Revocation preserves the token.
/// @dev Non-upgradeable. DEFAULT_ADMIN_ROLE manages ORGANIZER_ROLE. The initial
///      admin is deliberately not an organizer until explicitly granted that role.
contract SoulboundCertificate is ERC721URIStorage, AccessControl, ReentrancyGuard, IERC5192 {
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");
    uint256 public constant MAX_EVENT_ID_BYTES = 128;
    uint256 public constant MAX_METADATA_URI_BYTES = 2048;

    struct CertificateData {
        string eventId;
        address recipient;
        address issuer;
        bytes32 certificateHash;
        uint256 issuedAt;
        bool revoked;
        uint256 revokedAt;
        address revokedBy;
    }

    uint256 private _nextTokenId;
    mapping(uint256 tokenId => CertificateData) private _certificates;
    // Plus one distinguishes a missing entry from the valid token ID zero.
    mapping(bytes32 eventHash => mapping(address recipient => uint256 tokenPlusOne)) private _issued;

    error InvalidAdmin();
    error InvalidRecipient();
    error InvalidEventId();
    error InvalidMetadataURI();
    error InvalidCertificateHash();
    error CertificateAlreadyIssued(address recipient, bytes32 eventHash);
    error CertificateNotFound(address recipient, bytes32 eventHash);
    error SoulboundTransferForbidden(uint256 tokenId);
    error ApprovalsDisabled();
    error NotCertificateIssuer(address caller, uint256 tokenId);
    error CertificateAlreadyRevoked(uint256 tokenId);

    event CertificateIssued(
        uint256 indexed tokenId,
        address indexed recipient,
        string indexed eventId,
        string metadataURI,
        bytes32 certificateHash,
        address issuer,
        uint256 issuedAt
    );
    event CertificateRevoked(uint256 indexed tokenId, address indexed revokedBy);

    constructor(address initialAdmin) ERC721("SBT Certificate", "SBTC") {
        if (initialAdmin == address(0)) revert InvalidAdmin();
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
    }

    /// @notice Issue exactly one certificate per (recipient, eventId), forever.
    /// @dev eventId is a case-sensitive UTF-8 identifier. Hash the exact same
    ///      eventId bytes off-chain. Revocation never releases the duplicate guard.
    function mintCertificate(
        address recipient,
        string calldata eventId,
        string calldata metadataURI,
        bytes32 certificateHash
    ) external onlyRole(ORGANIZER_ROLE) nonReentrant returns (uint256 tokenId) {
        if (recipient == address(0)) revert InvalidRecipient();
        bytes memory eventBytes = bytes(eventId);
        if (
            eventBytes.length == 0 || eventBytes.length > MAX_EVENT_ID_BYTES
                || uint8(eventBytes[0]) <= 32 || uint8(eventBytes[eventBytes.length - 1]) <= 32
        ) revert InvalidEventId();
        bytes memory uriBytes = bytes(metadataURI);
        if (
            uriBytes.length == 0 || uriBytes.length > MAX_METADATA_URI_BYTES
                || uint8(uriBytes[0]) <= 32 || uint8(uriBytes[uriBytes.length - 1]) <= 32
        ) revert InvalidMetadataURI();
        if (certificateHash == bytes32(0)) revert InvalidCertificateHash();

        bytes32 eventHash = keccak256(eventBytes);
        if (_issued[eventHash][recipient] != 0) revert CertificateAlreadyIssued(recipient, eventHash);

        tokenId = _nextTokenId++;
        _issued[eventHash][recipient] = tokenId + 1;
        _certificates[tokenId] = CertificateData({
            eventId: eventId,
            recipient: recipient,
            issuer: _msgSender(),
            certificateHash: certificateHash,
            issuedAt: block.timestamp,
            revoked: false,
            revokedAt: 0,
            revokedBy: address(0)
        });

        // This is OZ v5's safe-mint sequence with metadata/events initialized
        // before the receiver callback. A rejected callback rolls everything back.
        _mint(recipient, tokenId);
        _setTokenURI(tokenId, metadataURI);
        emit Locked(tokenId);
        emit CertificateIssued(tokenId, recipient, eventId, metadataURI, certificateHash, _msgSender(), block.timestamp);
        ERC721Utils.checkOnERC721Received(_msgSender(), address(0), recipient, tokenId, "");
    }

    /// @notice Admin may revoke any certificate. An active organizer may revoke
    ///         only certificates originally issued by that organizer.
    function revokeCertificate(uint256 tokenId) external nonReentrant {
        _requireOwned(tokenId);
        CertificateData storage certificate = _certificates[tokenId];
        if (!hasRole(DEFAULT_ADMIN_ROLE, _msgSender())) {
            _checkRole(ORGANIZER_ROLE);
            if (certificate.issuer != _msgSender()) revert NotCertificateIssuer(_msgSender(), tokenId);
        }
        if (certificate.revoked) revert CertificateAlreadyRevoked(tokenId);
        certificate.revoked = true;
        certificate.revokedAt = block.timestamp;
        certificate.revokedBy = _msgSender();
        emit CertificateRevoked(tokenId, _msgSender());
    }

    /// @inheritdoc IERC5192
    function locked(uint256 tokenId) public view override returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @notice Unknown and revoked tokens are invalid. All callers may verify.
    function verifyCertificate(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0) && !_certificates[tokenId].revoked;
    }

    function isRevoked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return _certificates[tokenId].revoked;
    }

    function getCertificate(uint256 tokenId) external view returns (CertificateData memory) {
        _requireOwned(tokenId);
        return _certificates[tokenId];
    }

    function hasCertificate(address recipient, string calldata eventId) external view returns (bool) {
        return _issued[keccak256(bytes(eventId))][recipient] != 0;
    }

    function certificateTokenId(address recipient, string calldata eventId) external view returns (uint256) {
        bytes32 eventHash = keccak256(bytes(eventId));
        uint256 plusOne = _issued[eventHash][recipient];
        if (plusOne == 0) revert CertificateNotFound(recipient, eventHash);
        return plusOne - 1;
    }

    /// @notice Includes revoked certificates: tokens are never burned.
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    function approve(address, uint256) public pure override(ERC721, IERC721) {
        revert ApprovalsDisabled();
    }

    function setApprovalForAll(address, bool) public pure override(ERC721, IERC721) {
        revert ApprovalsDisabled();
    }

    /// @dev OZ v5 routes transferFrom, both safeTransferFrom overloads and burn
    ///      through _update. Only creation of a previously nonexistent token is allowed.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert SoulboundTransferForbidden(tokenId);
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }
}
