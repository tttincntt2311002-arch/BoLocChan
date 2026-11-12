// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC5192
 * @dev Interface for ERC-5192: Minimal Soulbound NFTs
 *      https://eips.ethereum.org/EIPS/eip-5192
 */
interface IERC5192 {
    /// @dev Emitted when the locking status is changed to locked.
    event Locked(uint256 tokenId);

    /// @dev Emitted when the locking status is changed to unlocked.
    event Unlocked(uint256 tokenId);

    /**
     * @notice Returns the locking status of an Soulbound Token.
     * @dev SBTs assigned to zero address are considered invalid, and queries
     *      about them do throw.
     * @param tokenId The identifier for an SBT.
     */
    function locked(uint256 tokenId) external view returns (bool);
}
