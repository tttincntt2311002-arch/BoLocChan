// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {SoulboundCertificate} from "../SoulboundCertificate.sol";

/// @dev Test-only receiver: observes fully initialized state and probes callback attacks.
contract CertificateReceiver is IERC721Receiver {
    SoulboundCertificate public immutable certificate;
    bool public reject;
    bool public attack;
    bool public observedInitialized;
    bool public mintBlocked;
    bool public revokeBlocked;
    bool public transferBlocked;
    bytes4 public mintError;
    bytes4 public revokeError;
    bytes4 public transferError;

    constructor(SoulboundCertificate certificate_) {
        certificate = certificate_;
    }

    function configure(bool reject_, bool attack_) external {
        reject = reject_;
        attack = attack_;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        require(msg.sender == address(certificate), "Wrong token contract");
        SoulboundCertificate.CertificateData memory data = certificate.getCertificate(tokenId);
        observedInitialized = certificate.ownerOf(tokenId) == address(this)
            && certificate.locked(tokenId) && certificate.verifyCertificate(tokenId)
            && bytes(certificate.tokenURI(tokenId)).length != 0
            && certificate.hasCertificate(address(this), data.eventId)
            && certificate.certificateTokenId(address(this), data.eventId) == tokenId
            && data.recipient == address(this) && data.certificateHash != bytes32(0);
        if (attack) {
            // An organizer receiver must still be blocked by nonReentrant,
            // even when trying a different event or a separate write method.
            try certificate.mintCertificate(address(this), "nested-event", "ipfs://nested", keccak256("nested")) {}
            catch (bytes memory reason) {
                mintBlocked = true;
                mintError = bytes4(reason);
            }
            try certificate.revokeCertificate(tokenId) {}
            catch (bytes memory reason) {
                revokeBlocked = true;
                revokeError = bytes4(reason);
            }
            try certificate.transferFrom(address(this), address(0x1234), tokenId) {}
            catch (bytes memory reason) {
                transferBlocked = true;
                transferError = bytes4(reason);
            }
        }
        return reject ? bytes4(0) : IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev Harness exercises internal OZ transfer/burn routes, not just public wrappers.
contract CertificateHarness is SoulboundCertificate {
    constructor(address initialAdmin) SoulboundCertificate(initialAdmin) {}

    function internalTransfer(address from, address to, uint256 tokenId) external {
        _transfer(from, to, tokenId);
    }

    function internalBurn(uint256 tokenId) external {
        _burn(tokenId);
    }
}
