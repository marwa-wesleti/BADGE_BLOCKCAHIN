const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Chaque test s'execute sur une blockchain locale simulee (rien n est envoye a un vrai reseau).
describe("BadgeRegistry", function () {
  async function deploy() {
    // ecole = celui qui deploie ; alice = une eleve ; intrus = quelqu'un qui n'a aucun droit
    const [ecole, alice, intrus] = await ethers.getSigners();
    const registry = await ethers.deployContract("BadgeRegistry");
    return { registry, ecole, alice, intrus };
  }

  const hash = (texte) => ethers.sha256(ethers.toUtf8Bytes(texte)); // SHA-256, comme en Java

  describe("deploiement", function () {
    it("celui qui deploie devient l'ecole", async function () {
      const { registry, ecole } = await loadFixture(deploy);
      expect(await registry.owner()).to.equal(ecole.address);
    });
  });

  describe("badges", function () {
    it("l'ecole delivre un badge, visible ensuite par tous", async function () {
      const { registry, alice } = await loadFixture(deploy);
      expect(await registry.hasBadge(alice.address, 1)).to.equal(false);

      await registry.issueBadge(alice.address, 1, "Introduction a la blockchain");

      expect(await registry.hasBadge(alice.address, 1)).to.equal(true);
      expect(await registry.badgeIssuedAt(alice.address, 1)).to.be.greaterThan(0n);
      expect(await registry.badgeCount(alice.address)).to.equal(1n);
    });

    it("emet l'evenement BadgeIssued", async function () {
      const { registry, alice } = await loadFixture(deploy);
      await expect(registry.issueBadge(alice.address, 7, "Solidity"))
        .to.emit(registry, "BadgeIssued")
        .withArgs(alice.address, 7, "Solidity", (date) => date > 0n);
    });

    it("REFUSE un appelant qui n'est pas l'ecole", async function () {
      const { registry, alice, intrus } = await loadFixture(deploy);
      await expect(registry.connect(intrus).issueBadge(alice.address, 1, "Faux badge"))
        .to.be.revertedWith("Seule l'ecole peut effectuer cette action");
      expect(await registry.hasBadge(alice.address, 1)).to.equal(false);
    });

    it("REFUSE un deuxieme badge pour le meme cours", async function () {
      const { registry, alice } = await loadFixture(deploy);
      await registry.issueBadge(alice.address, 1, "Cours 1");
      await expect(registry.issueBadge(alice.address, 1, "Cours 1"))
        .to.be.revertedWith("Badge deja delivre pour ce cours");
      expect(await registry.badgeCount(alice.address)).to.equal(1n);
    });

    it("accepte deux cours differents pour la meme eleve", async function () {
      const { registry, alice } = await loadFixture(deploy);
      await registry.issueBadge(alice.address, 1, "Cours 1");
      await registry.issueBadge(alice.address, 2, "Cours 2");
      expect(await registry.badgeCount(alice.address)).to.equal(2n);
    });

    it("REFUSE l'adresse zero", async function () {
      const { registry } = await loadFixture(deploy);
      await expect(registry.issueBadge(ethers.ZeroAddress, 1, "x")).to.be.revertedWith("Eleve invalide");
    });
  });

  describe("preuves d'integrite", function () {
    it("grave une empreinte puis la retrouve avec sa date", async function () {
      const { registry } = await loadFixture(deploy);
      const h = hash("Contrat v1");

      await registry.anchorDocument(h);

      const [exists, anchoredAt] = await registry.verifyDocument(h);
      expect(exists).to.equal(true);
      expect(anchoredAt).to.be.greaterThan(0n);
    });

    it("un texte modifie d'une seule lettre n'est pas reconnu", async function () {
      const { registry } = await loadFixture(deploy);
      await registry.anchorDocument(hash("Contrat v1"));

      const [exists, anchoredAt] = await registry.verifyDocument(hash("Contrat v2"));
      expect(exists).to.equal(false);
      expect(anchoredAt).to.equal(0n);
    });

    it("emet l'evenement DocumentAnchored", async function () {
      const { registry } = await loadFixture(deploy);
      const h = hash("Rapport");
      await expect(registry.anchorDocument(h)).to.emit(registry, "DocumentAnchored").withArgs(h, (d) => d > 0n);
    });

    it("REFUSE un appelant qui n'est pas l'ecole", async function () {
      const { registry, intrus } = await loadFixture(deploy);
      await expect(registry.connect(intrus).anchorDocument(hash("x")))
        .to.be.revertedWith("Seule l'ecole peut effectuer cette action");
    });

    it("REFUSE de graver deux fois la meme empreinte (la date d'origine est conservee)", async function () {
      const { registry } = await loadFixture(deploy);
      const h = hash("Contrat v1");
      await registry.anchorDocument(h);
      const [, premiereDate] = await registry.verifyDocument(h);

      await expect(registry.anchorDocument(h)).to.be.revertedWith("Empreinte deja gravee");

      const [, dateApres] = await registry.verifyDocument(h);
      expect(dateApres).to.equal(premiereDate);
    });
  });
});
