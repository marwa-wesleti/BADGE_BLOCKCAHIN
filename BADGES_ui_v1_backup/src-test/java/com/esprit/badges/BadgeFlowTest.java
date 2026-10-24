package com.esprit.badges;

import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.service.ProofService;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Scenario complet d'Alice, de l'inscription a la verification, avec un Ethereum simule. */
@SpringBootTest
@AutoConfigureMockMvc
class BadgeFlowTest {

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
    void scenarioComplet() throws Exception {
        String aliceWallet = FakeEthereumService.addressNumber(1001);

        // --- utilisateurs : le portefeuille est cree, la cle privee est montree une seule fois
        post("/api/users/register", "{\"username\":\"alice\",\"email\":\"Alice@Example.com\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.privateKey").value("priv"))
                .andExpect(jsonPath("$.user.email").value("alice@example.com"))
                .andExpect(jsonPath("$.user.walletAddress").value(aliceWallet));
        post("/api/users/register", "{\"username\":\"alice2\",\"email\":\"alice@example.com\"}")
                .andExpect(status().isConflict());
        post("/api/users/register", "{\"username\":\"x\"}").andExpect(status().isBadRequest());

        // --- cours
        String body = post("/api/courses",
                "{\"title\":\"Intro blockchain avec un titre tres tres long et accentue éèà\",\"description\":\"d\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.course.difficulty").value("Beginner"))
                .andReturn().getResponse().getContentAsString();
        int courseId = JsonPath.read(body, "$.course.id");
        post("/api/courses", "{\"title\":\"t\"}").andExpect(status().isBadRequest());
        post("/api/courses", "{\"title\":\"t\",\"description\":\"d\",\"difficulty\":\"Nimporte\"}")
                .andExpect(status().isBadRequest());

        // --- pas de badge avant la fin du cours (regle verifiee cote serveur, aucune transaction envoyee)
        String issue = "{\"email\":\"alice@example.com\",\"courseId\":" + courseId + "}";
        post("/api/badges/issue", issue).andExpect(status().isBadRequest());
        assertThat(chain.issueCalls).isZero();

        post("/api/courses/" + courseId + "/complete", "{\"email\":\"alice@example.com\"}").andExpect(status().isOk());
        post("/api/courses/" + courseId + "/complete", "{\"email\":\"alice@example.com\"}").andExpect(status().isConflict());
        post("/api/courses/999/complete", "{\"email\":\"alice@example.com\"}").andExpect(status().isNotFound());
        mvc.perform(MockMvcRequestBuilders.post("/api/courses/abc/complete").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"alice@example.com\"}")).andExpect(status().isBadRequest());

        // --- le CONTRAT refuse un appelant qui n'est pas l'ecole : rien n'est enregistre
        chain.callerIsOwner = false;
        post("/api/badges/issue", issue)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Seule l'ecole")));
        chain.callerIsOwner = true;
        mvc.perform(get("/api/badges/user/alice@example.com")).andExpect(jsonPath("$.badges.length()").value(0));
        assertThat(chain.issueCalls).isZero();

        // --- delivrance du badge par le contrat
        post("/api/badges/issue", issue)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.badge.owner").value(aliceWallet))
                .andExpect(jsonPath("$.badge.txHash").value("0xissue1"))
                .andExpect(jsonPath("$.links.transaction").value("https://sepolia.etherscan.io/tx/0xissue1"));
        assertThat(chain.issueCalls).isEqualTo(1);
        post("/api/badges/issue", issue).andExpect(status().isConflict()); // deja delivre : refuse par le serveur
        assertThat(chain.issueCalls).isEqualTo(1);

        // --- verification publique : lue dans le contrat, avec l'adresse du portefeuille
        mvc.perform(get("/api/badges/verify/" + aliceWallet + "/" + courseId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.onChain.walletAddress").value(aliceWallet))
                .andExpect(jsonPath("$.onChain.issuedAt").exists())
                .andExpect(jsonPath("$.database.user").value("alice"));
        // meme adresse en majuscules : acceptee aussi
        mvc.perform(get("/api/badges/verify/0x" + aliceWallet.substring(2).toUpperCase() + "/" + courseId))
                .andExpect(jsonPath("$.valid").value(true));

        // un autre cours, ou un autre portefeuille : le contrat ne connait pas ce badge
        mvc.perform(get("/api/badges/verify/" + aliceWallet + "/999"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(false));
        mvc.perform(get("/api/badges/verify/" + FakeEthereumService.addressNumber(9999) + "/" + courseId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(false));
        mvc.perform(get("/api/badges/verify/pas-une-adresse/" + courseId)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/badges/verify/" + aliceWallet + "/0")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/badges/verify/" + aliceWallet + "/abc")).andExpect(status().isBadRequest());

        // --- profil
        mvc.perform(get("/api/users/alice@example.com"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.completedCourses.length()").value(1))
                .andExpect(jsonPath("$.badges.length()").value(1));
        mvc.perform(get("/api/users/inconnu@example.com")).andExpect(status().isNotFound());
    }

    @Test
    void configurationPubliqueSansSecret() throws Exception {
        String body = mvc.perform(get("/api/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.network").value("Ethereum Sepolia"))
                .andExpect(jsonPath("$.contractAddress").value("0x00000000000000000000000000000000000000c0"))
                .andExpect(jsonPath("$.explorer").value("https://sepolia.etherscan.io"))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("cle-factice").doesNotContain("privateKey").doesNotContain("password");
    }

    @Test
    void preuvesDIntegrite() throws Exception {
        String expected = ProofService.sha256("Contrat v1");
        assertThat(expected).isEqualTo("fb0b068c45e4e615f633dd4d37a975daa6a5bcf7669256c33d2bf8c842a23e43");

        post("/api/proofs", "{\"content\":\"Contrat v1\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.hash").value(expected))
                .andExpect(jsonPath("$.txHash").value("0xanchor1"))
                .andExpect(jsonPath("$.links.transaction").value("https://sepolia.etherscan.io/tx/0xanchor1"));

        // meme texte : reconnu ; une seule lettre changee : empreinte inconnue
        post("/api/proofs/verify", "{\"content\":\"Contrat v1\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.computedHash").value(expected))
                .andExpect(jsonPath("$.anchoredAt").exists());
        post("/api/proofs/verify", "{\"content\":\"Contrat v2\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(false));

        // on ne grave pas deux fois la meme empreinte
        post("/api/proofs", "{\"content\":\"Contrat v1\"}").andExpect(status().isConflict());
        assertThat(chain.anchorCalls).isEqualTo(1);

        // le contrat refuse un appelant qui n'est pas l'ecole
        chain.callerIsOwner = false;
        post("/api/proofs", "{\"content\":\"Autre document\"}").andExpect(status().isUnprocessableEntity());
        chain.callerIsOwner = true;

        post("/api/proofs", "{\"content\":\"\"}").andExpect(status().isBadRequest());
        post("/api/proofs/verify", "{}").andExpect(status().isBadRequest());
    }
}
