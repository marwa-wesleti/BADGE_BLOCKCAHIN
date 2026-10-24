package com.esprit.badges;

import com.esprit.badges.blockchain.EthereumProperties;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Scenario de Bob avec les badges NFT, avec un Ethereum simule : creation du jeton, doublon, verification. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:nftbadges;DB_CLOSE_DELAY=-1") // base separee de BadgeFlowTest
class NftBadgeFlowTest {

    private static final String NFT_CONTRACT = "0x00000000000000000000000000000000000000c1";

    @TestConfiguration
    static class FakeConfig {
        @Bean
        @Primary
        FakeEthereumService fakeEthereum(EthereumProperties props) {
            return new FakeEthereumService(props);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired FakeEthereumService chain;

    private ResultActions post(String url, String json) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post(url).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    @Test
    void scenarioCompletDuBadgeNft() throws Exception {
        String bobWallet = FakeEthereumService.addressNumber(1001);

        post("/api/users/register", "{\"username\":\"bob\",\"email\":\"bob@example.com\"}").andExpect(status().isCreated());
        String body = post("/api/courses", "{\"title\":\"Solidity pour debutants\",\"description\":\"d\"}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        int courseId = JsonPath.read(body, "$.course.id");
        String issue = "{\"email\":\"bob@example.com\",\"courseId\":" + courseId + "}";

        // --- pas de jeton avant la fin du cours : regle du serveur, aucune transaction envoyee
        post("/api/nft-badges/issue", issue).andExpect(status().isBadRequest());
        assertThat(chain.nftIssueCalls).isZero();
        post("/api/courses/" + courseId + "/complete", "{\"email\":\"bob@example.com\"}").andExpect(status().isOk());

        // --- le CONTRAT refuse un appelant qui n'est pas l'ecole : rien n'est enregistre
        chain.callerIsOwner = false;
        post("/api/nft-badges/issue", issue)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value(containsString("Seule l'ecole peut effectuer cette action")));
        chain.callerIsOwner = true;
        mvc.perform(get("/api/nft-badges/user/bob@example.com")).andExpect(jsonPath("$.badges.length()").value(0));

        // --- creation du jeton : le contrat donne le numero 1, et l'eleve en est proprietaire
        post("/api/nft-badges/issue", issue)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.badge.tokenId").value(1))
                .andExpect(jsonPath("$.badge.owner").value(bobWallet))
                .andExpect(jsonPath("$.badge.contractAddress").value(NFT_CONTRACT))
                .andExpect(jsonPath("$.badge.txHash").value("0xnft1"))
                .andExpect(jsonPath("$.links.transaction").value("https://sepolia.etherscan.io/tx/0xnft1"))
                .andExpect(jsonPath("$.links.token").value("https://sepolia.etherscan.io/nft/" + NFT_CONTRACT + "/1"));
        assertThat(chain.nftIssueCalls).isEqualTo(1);

        // --- un deuxieme jeton pour le meme cours est refuse par le serveur, sans transaction
        post("/api/nft-badges/issue", issue).andExpect(status().isConflict());
        assertThat(chain.nftIssueCalls).isEqualTo(1);

        // --- verification publique : lue dans le contrat (numero du jeton, proprietaire, date)
        mvc.perform(get("/api/nft-badges/verify/" + bobWallet + "/" + courseId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.onChain.tokenId").value(1))
                .andExpect(jsonPath("$.onChain.owner").value(bobWallet))
                .andExpect(jsonPath("$.onChain.issuedAt").value(FakeEthereumService.TIME))
                .andExpect(jsonPath("$.database.user").value("bob"));

        // --- un autre cours, un autre portefeuille ou une adresse invalide
        mvc.perform(get("/api/nft-badges/verify/" + bobWallet + "/999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.onChain.tokenId").doesNotExist());
        mvc.perform(get("/api/nft-badges/verify/" + FakeEthereumService.addressNumber(9999) + "/" + courseId))
                .andExpect(jsonPath("$.valid").value(false));
        mvc.perform(get("/api/nft-badges/verify/pas-une-adresse/" + courseId)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/nft-badges/verify/" + bobWallet + "/0")).andExpect(status().isBadRequest());

        // --- profil : la liste des badges NFT de l'eleve
        mvc.perform(get("/api/nft-badges/user/bob@example.com"))
                .andExpect(jsonPath("$.badges.length()").value(1))
                .andExpect(jsonPath("$.badges[0].tokenId").value(1));
        mvc.perform(get("/api/nft-badges/user/inconnu@example.com")).andExpect(status().isNotFound());
    }

    @Test
    void laConfigurationPubliqueAnnonceLeContratNft() throws Exception {
        mvc.perform(get("/api/config"))
                .andExpect(jsonPath("$.nftContractAddress").value(NFT_CONTRACT))
                .andExpect(jsonPath("$.privateKey").doesNotExist());
    }
}
