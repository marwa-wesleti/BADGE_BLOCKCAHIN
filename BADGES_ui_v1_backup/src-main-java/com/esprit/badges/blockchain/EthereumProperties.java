package com.esprit.badges.blockchain;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Reglages Ethereum lus dans application.properties (donc dans le .env).
 * rpcUrl          : la "porte d'entree" vers le reseau (un noeud Sepolia accessible en HTTPS).
 * privateKey      : cle du portefeuille de l'ECOLE : elle signe et paie toutes les transactions.
 * contractAddress : adresse du smart contract BadgeRegistry, obtenue au deploiement (SetupMain).
 * chainId         : 11155111 = Sepolia. Il est inclus dans chaque signature (empeche de rejouer sur un autre reseau).
 * nftContractAddress : adresse du smart contract BadgeNFT (badges sous forme de NFT). Facultative : sans elle,
 *                   les routes /api/nft-badges repondent 502 avec un message qui explique comment le deployer.
 */
@Validated
@ConfigurationProperties(prefix = "ethereum")
public record EthereumProperties(
        @NotBlank(message = "ETH_RPC_URL manquant dans .env") String rpcUrl,
        @NotBlank(message = "ETH_PRIVATE_KEY manquant dans .env") String privateKey,
        String contractAddress,
        long chainId,
        String nftContractAddress) {
}
