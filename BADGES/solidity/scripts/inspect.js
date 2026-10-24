// Outil de demonstration : interroge la blockchain DIRECTEMENT, sans passer par notre application Java.
// Aucune cle privee n'est utilisee et rien n'est jamais envoye : ce sont uniquement des LECTURES (eth_call).
//
// Usage (depuis le dossier solidity/) :
//   node scripts/inspect.js badge  <adresse> <cours>      un badge du registre existe-t-il ?
//   node scripts/inspect.js nft    <adresse> <cours>      le badge NFT : numero du jeton, proprietaire, description
//   node scripts/inspect.js tx     <hash>                 decode une transaction : qui, vers quoi, quelle fonction
//   node scripts/inspect.js last   [registre|nft]         decode la DERNIERE transaction recue par un contrat (sans recopier de hash)
//   node scripts/inspect.js hash   "<texte>"              empreinte SHA-256 d'un texte, et est-elle gravee ?
//   node scripts/inspect.js refuse <adresse> <cours>      SIMULE des appels interdits : le contrat les refuse-t-il ?
//
// Reglages facultatifs (variables d'environnement) : ETH_RPC_URL, CONTRACT_ADDRESS, NFT_CONTRACT_ADDRESS.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC = process.env.ETH_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const REGISTRY = process.env.CONTRACT_ADDRESS || "0x309851a5faa5e1f9cd3bb3405c8e97b71bdbd735";
const NFT = process.env.NFT_CONTRACT_ADDRESS || "0x7f8a948522a984a1b5b0605f009a78ef74152e09";

// L'ABI (notice d'utilisation des contrats) est le meme fichier que celui lu par le projet Java.
const abiDir = path.join(__dirname, "..", "..", "src", "main", "resources", "contracts");
const abi = (name) => JSON.parse(fs.readFileSync(path.join(abiDir, `${name}.abi.json`), "utf8"));

const provider = new ethers.JsonRpcProvider(RPC);
const registry = new ethers.Contract(REGISTRY, abi("BadgeRegistry"), provider);
const nft = new ethers.Contract(NFT, abi("BadgeNFT"), provider);

const utc = (seconds) => new Date(Number(seconds) * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
const line = (label, value) => console.log(`  ${label.padEnd(18)}: ${value}`);

function needAddress(value) {
  if (!ethers.isAddress(value || "")) {
    throw new Error("Adresse invalide : 0x suivi de 40 caracteres hexadecimaux attendus");
  }
  return value;
}

async function badge(student, course) {
  needAddress(student);
  console.log(`Question posee DIRECTEMENT au contrat registre ${REGISTRY}`);
  console.log(`  badgeIssuedAt(${student}, ${course})`);
  const issuedAt = await registry.badgeIssuedAt(student, BigInt(course));
  console.log(issuedAt === 0n ? "Reponse : 0  ->  aucun badge pour cette adresse et ce cours" : `Reponse : ${issuedAt}  ->  badge delivre le ${utc(issuedAt)}`);
}

async function nftBadge(student, course) {
  needAddress(student);
  console.log(`Question posee DIRECTEMENT au contrat NFT ${NFT}`);
  const tokenId = await nft.badgeTokenOf(student, BigInt(course));
  if (tokenId === 0n) {
    console.log("Reponse : 0  ->  aucun jeton NFT pour cette adresse et ce cours");
    return;
  }
  line("numero du jeton", tokenId);
  line("proprietaire", await nft.ownerOf(tokenId));
  line("date", utc(await nft.badgeIssuedAt(student, BigInt(course))));
  line("verrouille (5192)", await nft.locked(tokenId));
  const uri = await nft.tokenURI(tokenId);
  line("tokenURI", uri.slice(0, 48) + "... (JSON en base64)");
  line("description", Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
}

async function transaction(hash) {
  const [tx, receipt] = await Promise.all([provider.getTransaction(hash), provider.getTransactionReceipt(hash)]);
  if (!tx || !receipt) {
    throw new Error("Transaction introuvable sur ce reseau");
  }
  const block = await provider.getBlock(receipt.blockNumber);
  const target = tx.to.toLowerCase();
  const contract = target === REGISTRY.toLowerCase() ? registry : target === NFT.toLowerCase() ? nft : null;
  const label = contract === registry ? "contrat REGISTRE" : contract === nft ? "contrat NFT" : "autre adresse";

  console.log(`Transaction ${hash}`);
  line("statut", receipt.status === 1 ? "Success" : "Fail");
  line("bloc", `${receipt.blockNumber}  (${utc(block.timestamp)})`);
  line("de (From)", `${tx.from}   <- celui qui signe et qui paie`);
  line("vers (To)", `${tx.to}   <- ${label}`);
  line("valeur envoyee", `${ethers.formatEther(tx.value)} ETH`);
  line("gas utilise", `${receipt.gasUsed}  x  ${tx.gasPrice} wei  =  ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);

  if (contract) {
    const call = contract.interface.parseTransaction({ data: tx.data });
    console.log(`\nL'ordre contenu dans la transaction : ${call.name}`);
    call.fragment.inputs.forEach((input, i) => line(input.name, call.args[i]));
    for (const log of receipt.logs.filter((l) => l.address.toLowerCase() === target)) {
      const event = contract.interface.parseLog(log);
      console.log(`\nEvenement emis par le contrat : ${event.name}`);
      event.fragment.inputs.forEach((input, i) => line(input.name, event.args[i]));
    }
  }
}

/** Retrouve la derniere transaction qui a touche un contrat (via ses evenements des derniers blocs), puis la decode. */
async function last(which = "registre") {
  const address = which === "nft" ? NFT : REGISTRY;
  const latest = await provider.getBlockNumber();
  // On remonte par tranches de 5000 blocs (environ 17 heures) : les noeuds publics limitent la taille d'une recherche.
  const SLICE = 5000;
  const MAX_SLICES = 10; // environ 7 jours
  for (let i = 0; i < MAX_SLICES; i++) {
    const to = latest - i * SLICE;
    const logs = await provider.getLogs({ address, fromBlock: to - SLICE + 1, toBlock: to });
    if (logs.length > 0) {
      console.log(`Derniere transaction recue par le contrat ${which === "nft" ? "NFT" : "REGISTRE"} (${address}) :\n`);
      return transaction(logs[logs.length - 1].transactionHash);
    }
  }
  throw new Error("Aucune transaction recue par ce contrat depuis environ 7 jours");
}

async function documentHash(text) {
  const hash = ethers.sha256(ethers.toUtf8Bytes(text));
  console.log(`Texte    : ${text}`);
  console.log(`SHA-256  : ${hash}`);
  const [exists, anchoredAt] = await registry.verifyDocument(hash);
  console.log(exists ? `Le contrat connait cette empreinte : gravee le ${utc(anchoredAt)}` : "Le contrat ne connait pas cette empreinte : jamais gravee");
}

/** SIMULE des appels (eth_call) : rien n'est envoye, mais le contrat repond comme s'il les executait. */
async function refuse(student, course) {
  needAddress(student);
  const school = await registry.owner();
  const stranger = ethers.Wallet.createRandom().address;
  const reason = (e) => e.reason || e.shortMessage || e.message;

  console.log("Simulation sur le VRAI contrat : le contrat decide, pas notre serveur.");
  console.log(`  ecole (owner) : ${school}`);
  console.log(`  intrus        : ${stranger}   <- une adresse quelconque, creee a l'instant\n`);

  const attempts = [
    ["1. Un intrus essaie de delivrer un badge", () => registry.issueBadge.staticCall(student, 9999, "Faux badge", { from: stranger })],
    ["2. L'ecole essaie de delivrer le MEME badge une 2e fois", () => registry.issueBadge.staticCall(student, BigInt(course), "Doublon", { from: school })],
    ["3. L'ecole delivre un badge NOUVEAU (cours 9999)", () => registry.issueBadge.staticCall(student, 9999, "Test", { from: school })],
  ];
  const first = await nft.ownerOf(1).catch(() => null);
  if (first) {
    attempts.push([`4. Le proprietaire du jeton NFT numero 1 essaie de le donner a quelqu'un`, () => nft.transferFrom.staticCall(first, stranger, 1, { from: first })]);
  }

  for (const [title, run] of attempts) {
    console.log(title);
    try {
      await run();
      console.log("   -> ACCEPTE : le contrat dirait oui (rien n'est envoye, c'est une simulation)\n");
    } catch (e) {
      console.log(`   -> REFUSE par le contrat : "${reason(e)}"\n`);
    }
  }
}

const commands = { badge, nft: nftBadge, tx: transaction, last, hash: documentHash, refuse };

(async () => {
  const [command, ...args] = process.argv.slice(2);
  // "last" est la seule commande qui accepte zero argument
  if (!commands[command] || (args.length === 0 && command !== "last")) {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
    process.exit(command ? 1 : 0);
  }
  await commands[command](...args);
})().catch((e) => {
  console.error("Erreur : " + (e.shortMessage || e.message));
  process.exit(1);
});
