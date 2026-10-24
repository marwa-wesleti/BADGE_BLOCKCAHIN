package com.esprit.badges;

import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.blockchain.EthereumService;

import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * A lancer UNE SEULE FOIS par contrat :
 *   mvn compile exec:java                      deploie BadgeRegistry (le registre) et affiche CONTRACT_ADDRESS
 *   mvn compile exec:java -Dexec.args=nft      deploie BadgeNFT (les badges NFT) et affiche NFT_CONTRACT_ADDRESS
 * Deploie le smart contract sur Ethereum Sepolia. N'a pas besoin de la base de donnees.
 *
 * Le bytecode vient de src/main/resources/contracts/*.bin, produit par "npm run export"
 * dans le dossier solidity/ (voir le README).
 */
public class SetupMain {

    private static final String DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

    public static void main(String[] args) throws IOException {
        boolean nft = args.length > 0 && args[0].equalsIgnoreCase("nft");
        String contractName = nft ? "BadgeNFT" : "BadgeRegistry";
        String envVariable = nft ? "NFT_CONTRACT_ADDRESS" : "CONTRACT_ADDRESS";
        String bytecodeResource = "/contracts/" + contractName + ".bin";

        Properties env = new Properties();
        Path envFile = Path.of(".env");
        if (Files.exists(envFile)) {
            try (Reader reader = Files.newBufferedReader(envFile)) {
                env.load(reader);
            }
        }

        String privateKey = value(env, "ETH_PRIVATE_KEY");
        String rpcUrl = value(env, "ETH_RPC_URL");
        if (privateKey.isBlank()) {
            System.err.println("Variable manquante dans .env : ETH_PRIVATE_KEY (voir .env.example)");
            System.exit(1);
        }
        if (rpcUrl.isBlank()) {
            rpcUrl = DEFAULT_RPC;
        }

        try {
            String bytecodeHex = loadBytecode(bytecodeResource);
            System.out.println("Bytecode charge : " + bytecodeHex.length() / 2 + " octets");

            String chainIdValue = value(env, "CHAIN_ID");
            long chainId = chainIdValue.isBlank() ? 11155111 : Long.parseLong(chainIdValue); // 11155111 = Sepolia
            EthereumService ethereum = new EthereumService(new EthereumProperties(rpcUrl, privateKey, null, chainId, null));

            System.out.println("Portefeuille de l'ecole : " + ethereum.schoolAddress());
            BigDecimal balance = ethereum.schoolBalanceEth();
            System.out.println("Solde : " + balance.toPlainString() + " ETH (Sepolia)");
            if (balance.signum() == 0) {
                System.err.println("Solde nul : obtenez de l'ETH de test sur un faucet Sepolia (voir README), puis relancez.");
                System.exit(1);
            }

            System.out.println("Deploiement du smart contract " + contractName + " (attendre une dizaine de secondes)...");
            String contractAddress = ethereum.deployContract(bytecodeHex);

            System.out.println("\nOK. Copiez cette ligne dans votre fichier .env :\n");
            System.out.println(envVariable + "=" + contractAddress);
            System.out.println("\nVoir sur Etherscan : https://sepolia.etherscan.io/address/" + contractAddress);
            System.exit(0); // ferme les threads reseau
        } catch (Exception e) {
            System.err.println("Echec du setup : " + e.getMessage());
            System.exit(1);
        }
    }

    private static String loadBytecode(String resource) throws IOException {
        try (InputStream in = SetupMain.class.getResourceAsStream(resource)) {
            if (in == null) {
                throw new IOException("Fichier " + resource + " introuvable : lancez 'npm run export' dans solidity/");
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        }
    }

    /**
     * Les variables d'environnement du systeme PASSENT AVANT le fichier .env : c'est l'ordre de Spring Boot, et c'est ce
     * qui permet de viser temporairement une autre blockchain (par exemple locale) sans toucher au .env.
     */
    private static String value(Properties env, String key) {
        String fromSystem = System.getenv(key);
        if (fromSystem != null && !fromSystem.isBlank()) {
            return fromSystem.trim();
        }
        String fromFile = env.getProperty(key);
        return fromFile == null ? "" : fromFile.trim();
    }
}
