const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("SoulboundCertificate", function () {
  const EVENT = "event-001";
  const URI = "ipfs://bafycertificate/metadata.json";
  const HASH = ethers.keccak256(ethers.toUtf8Bytes("canonical certificate document"));
  const ROLE = ethers.id("ORGANIZER_ROLE");

  async function fixture() {
    const [admin, organizer, otherOrganizer, recipient, other, verifier] = await ethers.getSigners();
    const contract = await ethers.deployContract("SoulboundCertificate", [admin.address]);
    await contract.waitForDeployment();
    await contract.grantRole(ROLE, organizer.address);
    await contract.grantRole(ROLE, otherOrganizer.address);
    return { contract, admin, organizer, otherOrganizer, recipient, other, verifier };
  }

  async function issuedFixture() {
    const state = await fixture();
    await state.contract.connect(state.organizer).mintCertificate(state.recipient.address, EVENT, URI, HASH);
    return state;
  }

  async function mint(state, recipient = state.recipient.address, event = EVENT, uri = URI, hash = HASH) {
    return state.contract.connect(state.organizer).mintCertificate(recipient, event, uri, hash);
  }

  const transferCalls = [
    ["transferFrom", (c, from, to, id) => c.transferFrom(from, to, id)],
    ["safeTransferFrom", (c, from, to, id) => c["safeTransferFrom(address,address,uint256)"](from, to, id)],
    ["safeTransferFrom with data", (c, from, to, id) => c["safeTransferFrom(address,address,uint256,bytes)"](from, to, id, "0x1234")],
  ];

  describe("deployment and interfaces", function () {
    it("rejects the zero initial administrator", async function () {
      const factory = await ethers.getContractFactory("SoulboundCertificate");
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, "InvalidAdmin");
    });

    it("sets the administrator without implicitly granting mint permission", async function () {
      const { contract, admin } = await loadFixture(fixture);
      expect(await contract.hasRole(ethers.ZeroHash, admin.address)).to.equal(true);
      expect(await contract.hasRole(ROLE, admin.address)).to.equal(false);
      expect(await contract.getRoleAdmin(ROLE)).to.equal(ethers.ZeroHash);
    });

    it("starts with correct metadata and zero supply", async function () {
      const { contract } = await loadFixture(fixture);
      expect(await contract.name()).to.equal("SBT Certificate");
      expect(await contract.symbol()).to.equal("SBTC");
      expect(await contract.totalSupply()).to.equal(0);
      expect(await contract.verifyCertificate(0)).to.equal(false);
    });

    for (const [name, id] of [
      ["ERC165", "0x01ffc9a7"], ["ERC721", "0x80ac58cd"], ["ERC721Metadata", "0x5b5e139f"],
      ["ERC5192", "0xb45a3c0e"], ["AccessControl", "0x7965db0b"], ["ERC4906", "0x49064906"],
    ]) {
      it("supports " + name + " through ERC165", async function () {
        const { contract } = await loadFixture(fixture);
        expect(await contract.supportsInterface(id)).to.equal(true);
      });
    }

    it("rejects unknown and invalid interfaces", async function () {
      const { contract } = await loadFixture(fixture);
      expect(await contract.supportsInterface("0xffffffff")).to.equal(false);
      expect(await contract.supportsInterface("0x12345678")).to.equal(false);
    });
  });

  describe("role boundaries", function () {
    it("admin grants organizer permission, enabling mint", async function () {
      const s = await loadFixture(fixture);
      await expect(s.contract.grantRole(ROLE, s.other.address))
        .to.emit(s.contract, "RoleGranted").withArgs(ROLE, s.other.address, s.admin.address);
      await s.contract.connect(s.other).mintCertificate(s.recipient.address, EVENT, URI, HASH);
      expect((await s.contract.getCertificate(0)).issuer).to.equal(s.other.address);
    });

    for (const actor of ["recipient", "verifier", "organizer"]) {
      for (const method of ["grantRole", "revokeRole"]) {
        it(actor + " cannot " + method + " for organizers", async function () {
          const s = await loadFixture(fixture);
          await expect(s.contract.connect(s[actor])[method](ROLE, s.otherOrganizer.address))
            .to.be.revertedWithCustomError(s.contract, "AccessControlUnauthorizedAccount")
            .withArgs(s[actor].address, ethers.ZeroHash);
        });
      }
    }

    for (const actor of ["recipient", "verifier", "admin"]) {
      it(actor + " cannot mint without an explicit organizer grant", async function () {
        const s = await loadFixture(fixture);
        await expect(s.contract.connect(s[actor]).mintCertificate(s.other.address, EVENT, URI, HASH))
          .to.be.revertedWithCustomError(s.contract, "AccessControlUnauthorizedAccount")
          .withArgs(s[actor].address, ROLE);
      });
    }

    it("admin may explicitly grant itself organizer permission", async function () {
      const s = await loadFixture(fixture);
      await s.contract.grantRole(ROLE, s.admin.address);
      await s.contract.mintCertificate(s.recipient.address, EVENT, URI, HASH);
      expect(await s.contract.ownerOf(0)).to.equal(s.recipient.address);
    });

    it("revoking an organizer blocks subsequent mint without invalidating issued tokens", async function () {
      const s = await loadFixture(issuedFixture);
      await expect(s.contract.revokeRole(ROLE, s.organizer.address))
        .to.emit(s.contract, "RoleRevoked").withArgs(ROLE, s.organizer.address, s.admin.address);
      await expect(mint(s, s.other.address)).to.be.revertedWithCustomError(s.contract, "AccessControlUnauthorizedAccount");
      expect(await s.contract.verifyCertificate(0)).to.equal(true);
    });

    it("organizers cannot escalate themselves to administrator", async function () {
      const s = await loadFixture(fixture);
      await expect(s.contract.connect(s.organizer).grantRole(ethers.ZeroHash, s.organizer.address))
        .to.be.revertedWithCustomError(s.contract, "AccessControlUnauthorizedAccount");
    });

    it("an organizer may renounce its own role and loses mint permission", async function () {
      const s = await loadFixture(fixture);
      await s.contract.connect(s.organizer).renounceRole(ROLE, s.organizer.address);
      await expect(mint(s)).to.be.revertedWithCustomError(s.contract, "AccessControlUnauthorizedAccount");
    });
  });

  describe("issuance and duplicate prevention", function () {
    it("mints token zero with the recipient, immutable URI and certificate data", async function () {
      const s = await loadFixture(fixture);
      expect(await s.contract.connect(s.organizer).mintCertificate.staticCall(s.recipient.address, EVENT, URI, HASH)).to.equal(0);
      const tx = await mint(s);
      const block = await ethers.provider.getBlock((await tx.wait()).blockNumber);
      expect(await s.contract.ownerOf(0)).to.equal(s.recipient.address);
      expect(await s.contract.balanceOf(s.recipient.address)).to.equal(1);
      expect(await s.contract.tokenURI(0)).to.equal(URI);
      const data = await s.contract.getCertificate(0);
      expect(data.eventId).to.equal(EVENT);
      expect(data.recipient).to.equal(s.recipient.address);
      expect(data.issuer).to.equal(s.organizer.address);
      expect(data.certificateHash).to.equal(HASH);
      expect(data.issuedAt).to.equal(block.timestamp);
      expect(data.revoked).to.equal(false);
      expect(data.revokedAt).to.equal(0);
      expect(data.revokedBy).to.equal(ethers.ZeroAddress);
    });

    it("emits ERC721 Transfer, ERC5192 Locked and CertificateIssued on the actual mint transaction", async function () {
      const s = await loadFixture(fixture);
      const tx = await mint(s);
      const block = await ethers.provider.getBlock((await tx.wait()).blockNumber);
      await expect(tx).to.emit(s.contract, "Transfer").withArgs(ethers.ZeroAddress, s.recipient.address, 0);
      await expect(tx).to.emit(s.contract, "Locked").withArgs(0);
      await expect(tx).to.emit(s.contract, "CertificateIssued")
        .withArgs(0, s.recipient.address, EVENT, URI, HASH, s.organizer.address, block.timestamp);
      expect(await s.contract.locked(0)).to.equal(true);
    });

    it("uses distinct sequential token IDs across recipients and events", async function () {
      const s = await loadFixture(fixture);
      await mint(s);
      await mint(s, s.other.address);
      await mint(s, s.recipient.address, "event-002");
      expect(await s.contract.totalSupply()).to.equal(3);
      expect(await s.contract.ownerOf(0)).to.equal(s.recipient.address);
      expect(await s.contract.ownerOf(1)).to.equal(s.other.address);
      expect(await s.contract.ownerOf(2)).to.equal(s.recipient.address);
    });

    it("rejects a duplicate wallet/event even from another organizer with different metadata/hash", async function () {
      const s = await loadFixture(issuedFixture);
      await expect(s.contract.connect(s.otherOrganizer).mintCertificate(s.recipient.address, EVENT, "ipfs://different", ethers.id("different")))
        .to.be.revertedWithCustomError(s.contract, "CertificateAlreadyIssued")
        .withArgs(s.recipient.address, ethers.id(EVENT));
      expect(await s.contract.totalSupply()).to.equal(1);
    });

    it("looks up token zero without confusing it with an absent certificate", async function () {
      const s = await loadFixture(issuedFixture);
      expect(await s.contract.hasCertificate(s.recipient.address, EVENT)).to.equal(true);
      expect(await s.contract.certificateTokenId(s.recipient.address, EVENT)).to.equal(0);
      expect(await s.contract.hasCertificate(s.other.address, EVENT)).to.equal(false);
      await expect(s.contract.certificateTokenId(s.other.address, EVENT))
        .to.be.revertedWithCustomError(s.contract, "CertificateNotFound");
    });

    const badInputs = [
      ["zero recipient", { recipient: ethers.ZeroAddress }, "InvalidRecipient"],
      ["empty event ID", { event: "" }, "InvalidEventId"],
      ["oversize event ID", { event: "e".repeat(129) }, "InvalidEventId"],
      ["leading event whitespace", { event: " event" }, "InvalidEventId"],
      ["trailing event whitespace", { event: "event\n" }, "InvalidEventId"],
      ["empty URI", { uri: "" }, "InvalidMetadataURI"],
      ["oversize URI", { uri: "i".repeat(2049) }, "InvalidMetadataURI"],
      ["leading URI whitespace", { uri: " ipfs://metadata" }, "InvalidMetadataURI"],
      ["trailing URI whitespace", { uri: "ipfs://metadata " }, "InvalidMetadataURI"],
      ["zero certificate hash", { hash: ethers.ZeroHash }, "InvalidCertificateHash"],
    ];
    for (const [name, changes, error] of badInputs) {
      it("rejects " + name + " without creating a token", async function () {
        const s = await loadFixture(fixture);
        await expect(mint(s, changes.recipient ?? s.recipient.address, changes.event ?? EVENT, changes.uri ?? URI, changes.hash ?? HASH))
          .to.be.revertedWithCustomError(s.contract, error);
        expect(await s.contract.totalSupply()).to.equal(0);
        expect(await s.contract.hasCertificate(s.recipient.address, EVENT)).to.equal(false);
      });
    }

    it("accepts the documented byte-length limits and Unicode event identifiers", async function () {
      const s = await loadFixture(fixture);
      const event = "é".repeat(64); // 128 UTF-8 bytes
      const uri = "ipfs://" + "a".repeat(2041);
      await mint(s, s.recipient.address, event, uri);
      expect((await s.contract.getCertificate(0)).eventId).to.equal(event);
      expect(await s.contract.tokenURI(0)).to.equal(uri);
      await expect(mint(s, s.other.address, event + "é")).to.be.revertedWithCustomError(s.contract, "InvalidEventId");
    });
  });

  describe("soulbound enforcement", function () {
    for (const [name, transfer] of transferCalls) {
      for (const actor of ["recipient", "organizer", "admin", "other"]) {
        it(name + " rejects " + actor + " transferring an existing token", async function () {
          const s = await loadFixture(issuedFixture);
          await expect(transfer(s.contract.connect(s[actor]), s.recipient.address, s.other.address, 0))
            .to.be.revertedWithCustomError(s.contract, "SoulboundTransferForbidden").withArgs(0);
          expect(await s.contract.ownerOf(0)).to.equal(s.recipient.address);
        });
      }

      it(name + " rejects self-transfer", async function () {
        const s = await loadFixture(issuedFixture);
        await expect(transfer(s.contract.connect(s.recipient), s.recipient.address, s.recipient.address, 0))
          .to.be.revertedWithCustomError(s.contract, "SoulboundTransferForbidden");
      });

      it(name + " rejects transfer to zero", async function () {
        const s = await loadFixture(issuedFixture);
        await expect(transfer(s.contract.connect(s.recipient), s.recipient.address, ethers.ZeroAddress, 0)).to.be.reverted;
        expect(await s.contract.ownerOf(0)).to.equal(s.recipient.address);
      });

      it(name + " rejects a nonexistent token", async function () {
        const s = await loadFixture(issuedFixture);
        await expect(transfer(s.contract.connect(s.recipient), s.recipient.address, s.other.address, 99))
          .to.be.revertedWithCustomError(s.contract, "ERC721NonexistentToken").withArgs(99);
      });

      it(name + " remains blocked after revocation", async function () {
        const s = await loadFixture(issuedFixture);
        await s.contract.revokeCertificate(0);
        await expect(transfer(s.contract.connect(s.recipient), s.recipient.address, s.other.address, 0))
          .to.be.revertedWithCustomError(s.contract, "SoulboundTransferForbidden");
        expect(await s.contract.locked(0)).to.equal(true);
      });
    }

    for (const actor of ["recipient", "organizer", "admin", "verifier"]) {
      it("rejects token approval by " + actor, async function () {
        const s = await loadFixture(issuedFixture);
        await expect(s.contract.connect(s[actor]).approve(s.other.address, 0))
          .to.be.revertedWithCustomError(s.contract, "ApprovalsDisabled");
      });
    }

    for (const approved of [true, false]) {
      it("rejects setApprovalForAll(" + approved + ")", async function () {
        const s = await loadFixture(issuedFixture);
        await expect(s.contract.connect(s.recipient).setApprovalForAll(s.other.address, approved))
          .to.be.revertedWithCustomError(s.contract, "ApprovalsDisabled");
        expect(await s.contract.isApprovedForAll(s.recipient.address, s.other.address)).to.equal(false);
      });
    }

    it("also rejects clearing approval and leaves no approved spender", async function () {
      const s = await loadFixture(issuedFixture);
      await expect(s.contract.connect(s.recipient).approve(ethers.ZeroAddress, 0))
        .to.be.revertedWithCustomError(s.contract, "ApprovalsDisabled");
      expect(await s.contract.getApproved(0)).to.equal(ethers.ZeroAddress);
    });

    it("blocks internal OZ transfer and burn routes in addition to public wrappers", async function () {
      const [admin, organizer, recipient, other] = await ethers.getSigners();
      const harness = await ethers.deployContract("CertificateHarness", [admin.address]);
      await harness.grantRole(ROLE, organizer.address);
      await harness.connect(organizer).mintCertificate(recipient.address, EVENT, URI, HASH);
      await expect(harness.internalTransfer(recipient.address, other.address, 0))
        .to.be.revertedWithCustomError(harness, "SoulboundTransferForbidden");
      await expect(harness.internalBurn(0)).to.be.revertedWithCustomError(harness, "SoulboundTransferForbidden");
      expect(await harness.ownerOf(0)).to.equal(recipient.address);
    });
  });

  describe("revocation and public verification", function () {
    for (const actor of ["organizer", "admin"]) {
      it(actor + " may revoke without burning or erasing history", async function () {
        const s = await loadFixture(issuedFixture);
        const before = await s.contract.getCertificate(0);
        const tx = await s.contract.connect(s[actor]).revokeCertificate(0);
        await expect(tx).to.emit(s.contract, "CertificateRevoked").withArgs(0, s[actor].address);
        await expect(tx).not.to.emit(s.contract, "Transfer");
        const block = await ethers.provider.getBlock((await tx.wait()).blockNumber);
        const after = await s.contract.getCertificate(0);
        expect(after.revoked).to.equal(true);
        expect(after.revokedAt).to.equal(block.timestamp);
        expect(after.revokedBy).to.equal(s[actor].address);
        expect(after.certificateHash).to.equal(before.certificateHash);
        expect(after.issuedAt).to.equal(before.issuedAt);
        expect(after.issuer).to.equal(before.issuer);
        expect(await s.contract.tokenURI(0)).to.equal(URI);
        expect(await s.contract.ownerOf(0)).to.equal(s.recipient.address);
        expect(await s.contract.balanceOf(s.recipient.address)).to.equal(1);
        expect(await s.contract.totalSupply()).to.equal(1);
        expect(await s.contract.locked(0)).to.equal(true);
        expect(await s.contract.verifyCertificate(0)).to.equal(false);
        expect(await s.contract.isRevoked(0)).to.equal(true);
        expect((await s.contract.queryFilter(s.contract.filters.CertificateIssued())).length).to.equal(1);
        expect((await s.contract.queryFilter(s.contract.filters.Locked())).length).to.equal(1);
        expect((await s.contract.queryFilter(s.contract.filters.Unlocked())).length).to.equal(0);
      });
    }

    it("an unrelated authorized organizer cannot revoke someone else's certificate", async function () {
      const s = await loadFixture(issuedFixture);
      await expect(s.contract.connect(s.otherOrganizer).revokeCertificate(0))
        .to.be.revertedWithCustomError(s.contract, "NotCertificateIssuer").withArgs(s.otherOrganizer.address, 0);
    });

    for (const actor of ["recipient", "verifier"]) {
      it(actor + " cannot revoke", async function () {
        const s = await loadFixture(issuedFixture);
        await expect(s.contract.connect(s[actor]).revokeCertificate(0))
          .to.be.revertedWithCustomError(s.contract, "AccessControlUnauthorizedAccount");
      });
    }

    it("an issuer whose role was removed cannot revoke, but admin still can", async function () {
      const s = await loadFixture(issuedFixture);
      await s.contract.revokeRole(ROLE, s.organizer.address);
      await expect(s.contract.connect(s.organizer).revokeCertificate(0))
        .to.be.revertedWithCustomError(s.contract, "AccessControlUnauthorizedAccount");
      await s.contract.revokeCertificate(0);
      expect(await s.contract.isRevoked(0)).to.equal(true);
    });

    it("does not allow repeated revocation or duplicate reissuance", async function () {
      const s = await loadFixture(issuedFixture);
      await s.contract.revokeCertificate(0);
      await expect(s.contract.revokeCertificate(0)).to.be.revertedWithCustomError(s.contract, "CertificateAlreadyRevoked").withArgs(0);
      await expect(mint(s)).to.be.revertedWithCustomError(s.contract, "CertificateAlreadyIssued");
      expect(await s.contract.hasCertificate(s.recipient.address, EVENT)).to.equal(true);
      expect(await s.contract.certificateTokenId(s.recipient.address, EVENT)).to.equal(0);
    });

    it("allows an unprivileged verifier to read all verification fields", async function () {
      const s = await loadFixture(issuedFixture);
      const reader = s.contract.connect(s.verifier);
      expect(await reader.verifyCertificate(0)).to.equal(true);
      expect(await reader.isRevoked(0)).to.equal(false);
      expect(await reader.ownerOf(0)).to.equal(s.recipient.address);
      expect(await reader.tokenURI(0)).to.equal(URI);
      expect(await reader.locked(0)).to.equal(true);
      expect((await reader.getCertificate(0)).certificateHash).to.equal(HASH);
    });

    for (const method of ["ownerOf", "tokenURI", "locked", "isRevoked", "getCertificate", "revokeCertificate"]) {
      it(method + " rejects nonexistent tokens", async function () {
        const { contract } = await loadFixture(fixture);
        await expect(contract[method](999)).to.be.revertedWithCustomError(contract, "ERC721NonexistentToken").withArgs(999);
      });
    }

    it("verifyCertificate returns false for unknown IDs", async function () {
      const { contract } = await loadFixture(fixture);
      expect(await contract.verifyCertificate(999)).to.equal(false);
    });
  });

  describe("ERC721 receiver callbacks and reentrancy", function () {
    it("initializes metadata, lock, hash and duplicate lookup before receiver callback", async function () {
      const s = await loadFixture(fixture);
      const receiver = await ethers.deployContract("CertificateReceiver", [await s.contract.getAddress()]);
      await mint(s, await receiver.getAddress());
      expect(await receiver.observedInitialized()).to.equal(true);
    });

    it("a receiver rejecting the token rolls back supply, metadata and duplicate guards", async function () {
      const s = await loadFixture(fixture);
      const receiver = await ethers.deployContract("CertificateReceiver", [await s.contract.getAddress()]);
      const address = await receiver.getAddress();
      await receiver.configure(true, false);
      await expect(mint(s, address)).to.be.revertedWithCustomError(s.contract, "ERC721InvalidReceiver").withArgs(address);
      expect(await s.contract.totalSupply()).to.equal(0);
      expect(await s.contract.hasCertificate(address, EVENT)).to.equal(false);
      expect(await s.contract.verifyCertificate(0)).to.equal(false);
      await receiver.configure(false, false);
      await mint(s, address);
      expect(await s.contract.ownerOf(0)).to.equal(address);
      expect(await receiver.observedInitialized()).to.equal(true);
    });

    it("rejects minting to a contract that does not implement ERC721Receiver", async function () {
      const s = await loadFixture(fixture);
      const address = await s.contract.getAddress();
      await expect(mint(s, address)).to.be.revertedWithCustomError(s.contract, "ERC721InvalidReceiver").withArgs(address);
      expect(await s.contract.totalSupply()).to.equal(0);
    });

    it("blocks nested mint, cross-function revoke and transfer from a privileged receiver callback", async function () {
      const s = await loadFixture(fixture);
      const receiver = await ethers.deployContract("CertificateReceiver", [await s.contract.getAddress()]);
      const address = await receiver.getAddress();
      await s.contract.grantRole(ROLE, address);
      await s.contract.grantRole(ethers.ZeroHash, address);
      await receiver.configure(false, true);
      await mint(s, address);
      expect(await receiver.observedInitialized()).to.equal(true);
      expect(await receiver.mintBlocked()).to.equal(true);
      expect(await receiver.revokeBlocked()).to.equal(true);
      expect(await receiver.transferBlocked()).to.equal(true);
      const guardError = ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10);
      expect(await receiver.mintError()).to.equal(guardError);
      expect(await receiver.revokeError()).to.equal(guardError);
      expect(await receiver.transferError()).to.equal(ethers.id("SoulboundTransferForbidden(uint256)").slice(0, 10));
      expect(await s.contract.totalSupply()).to.equal(1);
      expect(await s.contract.isRevoked(0)).to.equal(false);
      expect(await s.contract.hasCertificate(address, "nested-event")).to.equal(false);
    });
  });
});
