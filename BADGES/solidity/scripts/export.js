// Copie les contrats compiles (bytecode + ABI) dans les ressources du projet Java.
// Le projet Java n'a ainsi pas besoin de Node.js : il lit simplement ces fichiers.
const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "..", "..", "src", "main", "resources", "contracts");
fs.mkdirSync(target, { recursive: true });
console.log("Exporte vers " + target);

for (const name of ["BadgeRegistry", "BadgeNFT"]) {
  const artifact = require(`../artifacts/contracts/${name}.sol/${name}.json`);
  fs.writeFileSync(path.join(target, `${name}.bin`), artifact.bytecode.replace(/^0x/, ""));
  fs.writeFileSync(path.join(target, `${name}.abi.json`), JSON.stringify(artifact.abi, null, 2));

  console.log(`  ${name}.bin      : ${(artifact.bytecode.length - 2) / 2} octets de bytecode`);
  console.log(`  ${name}.abi.json : ${artifact.abi.filter((x) => x.type === "function").length} fonctions`);
}
