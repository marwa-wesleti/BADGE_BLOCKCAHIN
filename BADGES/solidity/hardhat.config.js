require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      // "paris" : jeu d'instructions accepte par tous les reseaux EVM, Hedera compris
      evmVersion: "paris",
      optimizer: { enabled: true, runs: 200 },
    },
  },
};
