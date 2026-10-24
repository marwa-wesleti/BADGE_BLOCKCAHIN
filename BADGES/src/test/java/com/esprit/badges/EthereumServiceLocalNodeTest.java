package com.esprit.badges;

import com.esprit.badges.blockchain.ContractRevertException;
import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.blockchain.EthereumService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Test du VRAI EthereumService (web3j) et du VRAI contrat compile, sur un noeud Ethereum LOCAL.
 * Il ne tourne que si on le demande : il faut d'abord lancer le noeud (cd solidity && npx hardhat node),
 * puis : mvn test -Dtest=EthereumServiceLocalNodeTest -DlocalNode=true
 * Les deux cles ci-dessous sont les cles de test publiques fournies par Hardhat : elles ne valent rien.
 */
@EnabledIfSystemProperty(named = "localNode", matches = "true")
class EthereumServiceLocalNodeTest {

    private static final String RPC = "http://127.0.0.1:8545";
    private static final long CHAIN_ID = 31337;
    private static final String SCHOOL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    private static final String STRANGER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

    private static EthereumService service(String key, String contract) {
        return new EthereumService(new EthereumProperties(RPC, key, contract, CHAIN_ID, null));
    }

    @Test
    void deployeUnVraiContratPuisLUtilise() throws Exception {
        String bytecode;
        try (InputStream in = getClass().getResourceAsStream("/contracts/BadgeRegistry.bin")) {
            bytecode = new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        }

        // --- deploiement : l'ecole recoit l'adresse du contrat
        EthereumService deployer = service(SCHOOL_KEY, null);
        assertThat(deployer.schoolBalanceEth()).isGreaterThan(BigDecimal.ONE);
        String contract = deployer.deployContract(bytecode);
        assertThat(contract).matches("^0x[0-9a-fA-F]{40}$");

        EthereumService school = service(SCHOOL_KEY, contract);
        EthereumService stranger = service(STRANGER_KEY, contract);
        String alice = school.createWallet().address();

        // --- badge : inconnu, puis delivre, puis lisible
        assertThat(school.getBadgeIssuedAt(alice, 1)).isEmpty();
        EthereumService.TxResult tx = school.issueBadge(alice, 1, "Introduction a la blockchain");
        assertThat(tx.transactionHash()).matches("^0x[0-9a-f]{64}$");
        assertThat(tx.blockNumber()).isPositive();
        assertThat(Instant.parse(tx.blockTime())).isAfter(Instant.parse("2024-01-01T00:00:00Z"));
        assertThat(school.getBadgeIssuedAt(alice, 1)).isPresent();
        assertThat(school.getBadgeIssuedAt(alice, 2)).isEmpty(); // autre cours : pas de badge

        // --- le contrat applique ses regles, et on recupere le message du require()
        assertThatThrownBy(() -> school.issueBadge(alice, 1, "Doublon"))
                .isInstanceOf(ContractRevertException.class)
                .hasMessageContaining("Badge deja delivre pour ce cours");
        assertThatThrownBy(() -> stranger.issueBadge(alice, 2, "Faux badge"))
                .isInstanceOf(ContractRevertException.class)
                .hasMessageContaining("Seule l'ecole peut effectuer cette action");
        assertThat(school.getBadgeIssuedAt(alice, 2)).isEmpty();

        // --- preuve d'integrite : une lettre de difference = empreinte inconnue
        byte[] v1 = MessageDigest.getInstance("SHA-256").digest("Contrat v1".getBytes(StandardCharsets.UTF_8));
        byte[] v2 = MessageDigest.getInstance("SHA-256").digest("Contrat v2".getBytes(StandardCharsets.UTF_8));
        assertThat(school.getDocumentAnchoredAt(v1)).isEmpty();
        school.anchorDocument(v1);
        assertThat(school.getDocumentAnchoredAt(v1)).isPresent();
        assertThat(school.getDocumentAnchoredAt(v2)).isEmpty();
        assertThatThrownBy(() -> school.anchorDocument(v1))
                .isInstanceOf(ContractRevertException.class)
                .hasMessageContaining("Empreinte deja gravee");
        assertThatThrownBy(() -> stranger.anchorDocument(v2))
                .isInstanceOf(ContractRevertException.class)
                .hasMessageContaining("Seule l'ecole");
    }

    @Test
    void deployeLeContratNftPuisCreeDesJetons() throws Exception {
        String bytecode;
        try (InputStream in = getClass().getResourceAsStream("/contracts/BadgeNFT.bin")) {
            bytecode = new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
        }

        String nft = service(SCHOOL_KEY, null).deployContract(bytecode);
        assertThat(nft).matches("^0x[0-9a-fA-F]{40}$");

        EthereumService school = new EthereumService(new EthereumProperties(RPC, SCHOOL_KEY, null, CHAIN_ID, nft));
        EthereumService stranger = new EthereumService(new EthereumProperties(RPC, STRANGER_KEY, null, CHAIN_ID, nft));
        String alice = school.createWallet().address();

        // --- aucun jeton au depart, puis le contrat en cree un : numero lu dans l'evenement Transfer du recu
        assertThat(school.getNftBadge(alice, 1)).isEmpty();
        EthereumService.NftMint mint = school.issueNftBadge(alice, 1, "Introduction à la blockchain");
        assertThat(mint.tokenId()).isEqualTo(1);
        assertThat(mint.tx().transactionHash()).matches("^0x[0-9a-f]{64}$");
        assertThat(mint.tx().blockNumber()).isPositive();

        // --- l'eleve est proprietaire du jeton, la date vient du contrat
        EthereumService.NftBadgeOnChain onChain = school.getNftBadge(alice, 1).orElseThrow();
        assertThat(onChain.tokenId()).isEqualTo(1);
        assertThat(onChain.owner()).isEqualToIgnoringCase(alice);
        assertThat(onChain.issuedAt()).isAfter(Instant.parse("2024-01-01T00:00:00Z"));
        assertThat(school.getNftBadge(alice, 2)).isEmpty(); // autre cours : pas de jeton

        // --- un deuxieme cours donne le jeton suivant
        assertThat(school.issueNftBadge(alice, 2, "Solidity").tokenId()).isEqualTo(2);

        // --- le contrat applique ses regles, et on recupere le message du require()
        assertThatThrownBy(() -> school.issueNftBadge(alice, 1, "Doublon"))
                .isInstanceOf(ContractRevertException.class)
                .hasMessageContaining("Badge deja delivre pour ce cours");
        assertThatThrownBy(() -> stranger.issueNftBadge(alice, 3, "Faux badge"))
                .isInstanceOf(ContractRevertException.class)
                .hasMessageContaining("Seule l'ecole peut effectuer cette action");
        assertThatThrownBy(() -> school.issueNftBadge(alice, 3, "Titre \"pirate\""))
                .isInstanceOf(ContractRevertException.class)
                .hasMessageContaining("Titre invalide");
        assertThat(school.getNftBadge(alice, 3)).isEmpty();
    }
}
