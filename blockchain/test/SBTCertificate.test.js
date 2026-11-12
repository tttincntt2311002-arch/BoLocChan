// test/SBTCertificate.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SBTCertificate", function () {
  let sbt;
  let owner, minter, user1, user2;
  const SAMPLE_URI = "ipfs://QmSampleCIDReplaceMeWithRealIPFSHash";
  const EVENT_ID   = "evt-001";
  const EVENT_NAME = "Hackathon 2025";

  beforeEach(async function () {
    [owner, minter, user1, user2] = await ethers.getSigners();
    const SBTCertificate = await ethers.getContractFactory("SBTCertificate");
    sbt = await SBTCertificate.deploy(owner.address);
    await sbt.waitForDeployment();
  });

  // ── Deployment ────────────────────────────────────────────────────────────
  describe("Deployment", function () {
    it("Should set the right owner and roles", async function () {
      const DEFAULT_ADMIN_ROLE = await sbt.DEFAULT_ADMIN_ROLE();
      const MINTER_ROLE = await sbt.MINTER_ROLE();
      expect(await sbt.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await sbt.hasRole(MINTER_ROLE, owner.address)).to.be.true;
    });

    it("Should have the correct name and symbol", async function () {
      expect(await sbt.name()).to.equal("SBT Certificate");
      expect(await sbt.symbol()).to.equal("SBTC");
    });

    it("Should start with zero total supply", async function () {
      expect(await sbt.totalSupply()).to.equal(0n);
    });
  });

  // ── Minting ───────────────────────────────────────────────────────────────
  describe("Minting", function () {
    it("Should mint a certificate to a recipient", async function () {
      await sbt.mintCertificate(user1.address, SAMPLE_URI, EVENT_ID, EVENT_NAME);
      expect(await sbt.ownerOf(0)).to.equal(user1.address);
      expect(await sbt.tokenURI(0)).to.equal(SAMPLE_URI);
    });

    it("Should emit CertificateMinted and Locked events", async function () {
      await expect(
        sbt.mintCertificate(user1.address, SAMPLE_URI, EVENT_ID, EVENT_NAME)
      )
        .to.emit(sbt, "CertificateMinted")
        .and.to.emit(sbt, "Locked").withArgs(0);
    });

    it("Should store certificate data on-chain", async function () {
      await sbt.mintCertificate(user1.address, SAMPLE_URI, EVENT_ID, EVENT_NAME);
      const cert = await sbt.getCertificate(0);
      expect(cert.eventId).to.equal(EVENT_ID);
      expect(cert.eventName).to.equal(EVENT_NAME);
      expect(cert.recipient).to.equal(user1.address);
      expect(cert.revoked).to.be.false;
    });

    it("Should revert when non-minter tries to mint", async function () {
      await expect(
        sbt.connect(user1).mintCertificate(user2.address, SAMPLE_URI, EVENT_ID, EVENT_NAME)
      ).to.be.reverted;
    });
  });

  // ── ERC-5192 Locking ──────────────────────────────────────────────────────
  describe("ERC-5192 Soulbound (non-transferable)", function () {
    beforeEach(async function () {
      await sbt.mintCertificate(user1.address, SAMPLE_URI, EVENT_ID, EVENT_NAME);
    });

    it("Should report token as locked", async function () {
      expect(await sbt.locked(0)).to.be.true;
    });

    it("Should block transfer between wallets", async function () {
      await expect(
        sbt.connect(user1).transferFrom(user1.address, user2.address, 0)
      ).to.be.revertedWith("SBT: token is non-transferable");
    });

    it("Should block safeTransferFrom", async function () {
      await expect(
        sbt.connect(user1)["safeTransferFrom(address,address,uint256)"](
          user1.address,
          user2.address,
          0
        )
      ).to.be.revertedWith("SBT: token is non-transferable");
    });
  });

  // ── Revocation ────────────────────────────────────────────────────────────
  describe("Revocation", function () {
    beforeEach(async function () {
      await sbt.mintCertificate(user1.address, SAMPLE_URI, EVENT_ID, EVENT_NAME);
    });

    it("Admin can revoke a certificate", async function () {
      await sbt.revokeCertificate(0);
      const cert = await sbt.getCertificate(0);
      expect(cert.revoked).to.be.true;
    });

    it("Should emit CertificateRevoked event", async function () {
      await expect(sbt.revokeCertificate(0))
        .to.emit(sbt, "CertificateRevoked")
        .withArgs(0, owner.address);
    });

    it("Non-admin cannot revoke", async function () {
      await expect(sbt.connect(user1).revokeCertificate(0)).to.be.reverted;
    });

    it("Cannot revoke an already revoked certificate", async function () {
      await sbt.revokeCertificate(0);
      await expect(sbt.revokeCertificate(0)).to.be.revertedWith("Already revoked");
    });
  });

  // ── ERC-165 ───────────────────────────────────────────────────────────────
  describe("Interface support", function () {
    it("Should support ERC-721 interface", async function () {
      expect(await sbt.supportsInterface("0x80ac58cd")).to.be.true;
    });
    it("Should support ERC-5192 interface", async function () {
      expect(await sbt.supportsInterface("0xb45a3c0e")).to.be.true;
    });
    it("Should support AccessControl interface", async function () {
      expect(await sbt.supportsInterface("0x7965db0b")).to.be.true;
    });
  });
});
