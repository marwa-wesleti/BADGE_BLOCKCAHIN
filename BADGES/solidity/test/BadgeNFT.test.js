const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Chaque test s'execute sur une blockchain locale simulee (rien n est envoye a un vrai reseau).
describe("BadgeNFT", function () {
  async function deploy() {
    // ecole = celui qui deploie ; alice = une eleve ; bob = un autre eleve ; intrus = aucun droit
    const [ecole, alice, bob, intrus] = await ethers.getSigners();
    const nft = await ethers.deployContract("BadgeNFT");
    return { nft, ecole, alice, bob, intrus };
  }

  describe("creation d'un badge", function () {
    it("l'ecole cree un badge : l'eleve en devient proprietaire", async function () {
      const { nft, ecole, alice } = await loadFixture(deploy);
      expect(await nft.owner()).to.equal(ecole.address);

      await nft.issueBadge(alice.address, 1, "Introduction a la blockchain");

      expect(await nft.ownerOf(1)).to.equal(alice.address);
      expect(await nft.balanceOf(alice.address)).to.equal(1n);
      expect(await nft.hasBadge(alice.address, 1)).to.equal(true);
      expect(await nft.badgeTokenOf(alice.address, 1)).to.equal(1n);
      expect(await nft.badgeIssuedAt(alice.address, 1)).to.be.greaterThan(0n);
    });

    it("emet les evenements standards Transfer (creation) et Locked (ERC-5192)", async function () {
      const { nft, alice } = await loadFixture(deploy);
      await expect(nft.issueBadge(alice.address, 1, "Solidity"))
        .to.emit(nft, "Transfer").withArgs(ethers.ZeroAddress, alice.address, 1)
        .and.to.emit(nft, "Locked").withArgs(1);
    });

    it("numerote les badges a partir de 1, un par creation", async function () {
      const { nft, alice, bob } = await loadFixture(deploy);
      await nft.issueBadge(alice.address, 1, "Cours 1");
      await nft.issueBadge(bob.address, 1, "Cours 1");
      await nft.issueBadge(alice.address, 2, "Cours 2");
      expect(await nft.ownerOf(2)).to.equal(bob.address);
      expect(await nft.ownerOf(3)).to.equal(alice.address);
      expect(await nft.balanceOf(alice.address)).to.equal(2n);
    });

    it("REFUSE un appelant qui n'est pas l'ecole", async function () {
      const { nft, alice, intrus } = await loadFixture(deploy);
      await expect(nft.connect(intrus).issueBadge(alice.address, 1, "Faux badge"))
        .to.be.revertedWith("Seule l'ecole peut effectuer cette action");
      expect(await nft.hasBadge(alice.address, 1)).to.equal(false);
    });

    it("REFUSE un deuxieme badge pour le meme cours", async function () {
      const { nft, alice } = await loadFixture(deploy);
      await nft.issueBadge(alice.address, 1, "Cours 1");
      await expect(nft.issueBadge(alice.address, 1, "Cours 1"))
        .to.be.revertedWith("Badge deja delivre pour ce cours");
      expect(await nft.balanceOf(alice.address)).to.equal(1n);
    });

    it("REFUSE l'adresse zero", async function () {
      const { nft } = await loadFixture(deploy);
      await expect(nft.issueBadge(ethers.ZeroAddress, 1, "x")).to.be.revertedWith("Eleve invalide");
    });

    it("REFUSE un titre vide, trop long ou qui pourrait casser le JSON", async function () {
      const { nft, alice } = await loadFixture(deploy);
      await expect(nft.issueBadge(alice.address, 1, "")).to.be.revertedWith("Titre invalide");
      await expect(nft.issueBadge(alice.address, 1, "a".repeat(201))).to.be.revertedWith("Titre invalide");
      await expect(nft.issueBadge(alice.address, 1, 'Cours "pirate"')).to.be.revertedWith("Titre invalide");
      await expect(nft.issueBadge(alice.address, 1, "Cours\\pirate")).to.be.revertedWith("Titre invalide");
    });
  });

  describe("badge non transferable (soulbound)", function () {
    it("REFUSE que le proprietaire transfere son badge", async function () {
      const { nft, alice, bob } = await loadFixture(deploy);
      await nft.issueBadge(alice.address, 1, "Cours 1");
      await expect(nft.connect(alice).transferFrom(alice.address, bob.address, 1))
        .to.be.revertedWith("Badge non transferable");
      expect(await nft.ownerOf(1)).to.equal(alice.address);
    });

    it("REFUSE meme un transfert approuve, ou fait par l'ecole", async function () {
      const { nft, ecole, alice, bob } = await loadFixture(deploy);
      await nft.issueBadge(alice.address, 1, "Cours 1");
      await nft.connect(alice).approve(bob.address, 1);
      await expect(nft.connect(bob).transferFrom(alice.address, bob.address, 1))
        .to.be.revertedWith("Badge non transferable");
      await expect(nft.connect(ecole).transferFrom(alice.address, ecole.address, 1))
        .to.be.revertedWith("Badge non transferable");
    });

    it("annonce qu'il est verrouille et respecte l'interface ERC-5192", async function () {
      const { nft, alice } = await loadFixture(deploy);
      await nft.issueBadge(alice.address, 1, "Cours 1");
      expect(await nft.locked(1)).to.equal(true);
      expect(await nft.supportsInterface("0xb45a3c0e")).to.equal(true); // ERC-5192
      expect(await nft.supportsInterface("0x80ac58cd")).to.equal(true); // ERC-721
    });
  });

  describe("description du badge", function () {
    it("tokenURI contient un JSON lisible : titre, cours et date", async function () {
      const { nft, alice } = await loadFixture(deploy);
      await nft.issueBadge(alice.address, 7, "Introduction à la blockchain");

      const uri = await nft.tokenURI(1);
      expect(uri.startsWith("data:application/json;base64,")).to.equal(true);

      const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
      expect(json.name).to.equal("Introduction à la blockchain");
      expect(json.attributes[0]).to.deep.equal({ trait_type: "Cours", value: 7 });
      expect(json.attributes[1].trait_type).to.equal("Delivre le");
      expect(json.attributes[1].value).to.be.greaterThan(0);
    });

    it("un badge qui n'existe pas n'a ni proprietaire ni description", async function () {
      const { nft, alice } = await loadFixture(deploy);
      await expect(nft.ownerOf(1)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
      await expect(nft.tokenURI(1)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
      expect(await nft.badgeIssuedAt(alice.address, 1)).to.equal(0n);
    });
  });
});
