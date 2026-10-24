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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static com.esprit.badges.TestAuth.get;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Scenario complet d'Alice et de l'ecole, de l'inscription a la verification, avec un Ethereum simule. */
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

    private ResultActions post(String url, String token, String json) throws Exception {
        return TestAuth.post(mvc, url, token, json);
    }

    @Test
    void scenarioComplet() throws Exception {
        // --- inscription : le portefeuille est cree, la cle privee est montree une seule fois
        String registration = post("/api/auth/register", null,
                "{\"username\":\"alice\",\"email\":\"Alice@Example.com\",\"password\":\"motdepasse1\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.privateKey").value("priv"))
                .andExpect(jsonPath("$.user.email").value("alice@example.com"))
                .andExpect(jsonPath("$.user.walletAddress").value(org.hamcrest.Matchers.matchesPattern("^0x[0-9a-f]{40}$")))
                .andExpect(jsonPath("$.user.role").value("ELEVE"))
                .andExpect(jsonPath("$.token").exists())
                .andReturn().getResponse().getContentAsString();
        // l'ordre des tests de la classe n'est pas garanti : on lit l'adresse donnee a Alice au lieu de la supposer
        String aliceWallet = JsonPath.read(registration, "$.user.walletAddress");
        post("/api/auth/register", null, "{\"username\":\"alice2\",\"email\":\"alice@example.com\",\"password\":\"motdepasse1\"}")
                .andExpect(status().isConflict());
        post("/api/auth/register", null, "{\"username\":\"x\"}").andExpect(status().isBadRequest());
        post("/api/auth/register", null, "{\"username\":\"bob\",\"email\":\"bob@example.com\",\"password\":\"court\"}")
                .andExpect(status().isBadRequest());

        String alice = TestAuth.login(mvc, "alice@example.com", "motdepasse1");
        String school = TestAuth.school(mvc);

        // --- cours : l'ecole seule peut en creer
        String newCourse = "{\"title\":\"Intro blockchain avec un titre tres tres long et accentue éèà\",\"description\":\"d\"}";
        post("/api/courses", null, newCourse).andExpect(status().isUnauthorized());
        post("/api/courses", alice, newCourse).andExpect(status().isForbidden());
        String body = post("/api/courses", school, newCourse)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.course.difficulty").value("Beginner"))
                .andReturn().getResponse().getContentAsString();
        int courseId = JsonPath.read(body, "$.course.id");
        post("/api/courses", school, "{\"title\":\"t\"}").andExpect(status().isBadRequest());
        post("/api/courses", school, "{\"title\":\"t\",\"description\":\"d\",\"difficulty\":\"Nimporte\"}")
                .andExpect(status().isBadRequest());

        // --- pas de badge avant la fin du cours (regle verifiee cote serveur, aucune transaction envoyee)
        String issue = "{\"email\":\"alice@example.com\",\"courseId\":" + courseId + "}";
        post("/api/badges/issue", school, issue).andExpect(status().isBadRequest());
        assertThat(chain.issueCalls).isZero();

        // un eleve ne peut ni valider son cours ni se delivrer un badge
        String complete = "{\"email\":\"alice@example.com\"}";
        post("/api/courses/" + courseId + "/complete", alice, complete).andExpect(status().isForbidden());
        post("/api/badges/issue", alice, issue).andExpect(status().isForbidden());
        post("/api/badges/issue", null, issue).andExpect(status().isUnauthorized());

        post("/api/courses/" + courseId + "/complete", school, complete).andExpect(status().isOk());
        post("/api/courses/" + courseId + "/complete", school, complete).andExpect(status().isConflict());
        post("/api/courses/999/complete", school, complete).andExpect(status().isNotFound());
        post("/api/courses/abc/complete", school, complete).andExpect(status().isBadRequest());

        // --- le CONTRAT refuse un appelant qui n'est pas l'ecole : rien n'est enregistre
        chain.callerIsOwner = false;
        post("/api/badges/issue", school, issue)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value(containsString("Seule l'ecole")));
        chain.callerIsOwner = true;
        get(mvc, "/api/badges/user/alice@example.com", school).andExpect(jsonPath("$.badges.length()").value(0));
        assertThat(chain.issueCalls).isZero();

        // --- delivrance du badge par le contrat
        post("/api/badges/issue", school, issue)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.badge.owner").value(aliceWallet))
                .andExpect(jsonPath("$.badge.txHash").value("0xissue1"))
                .andExpect(jsonPath("$.links.transaction").value("https://sepolia.etherscan.io/tx/0xissue1"));
        assertThat(chain.issueCalls).isEqualTo(1);
        post("/api/badges/issue", school, issue).andExpect(status().isConflict()); // deja delivre : refuse par le serveur
        assertThat(chain.issueCalls).isEqualTo(1);

        // --- verification PUBLIQUE (sans jeton) : lue dans le contrat, avec l'adresse du portefeuille
        get(mvc, "/api/badges/verify/" + aliceWallet + "/" + courseId, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.onChain.walletAddress").value(aliceWallet))
                .andExpect(jsonPath("$.onChain.issuedAt").exists())
                .andExpect(jsonPath("$.database.user").value("alice"));
        // meme adresse en majuscules : acceptee aussi
        get(mvc, "/api/badges/verify/0x" + aliceWallet.substring(2).toUpperCase() + "/" + courseId, null)
                .andExpect(jsonPath("$.valid").value(true));

        // un autre cours, ou un autre portefeuille : le contrat ne connait pas ce badge
        get(mvc, "/api/badges/verify/" + aliceWallet + "/999", null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(false));
        get(mvc, "/api/badges/verify/" + FakeEthereumService.addressNumber(9999) + "/" + courseId, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(false));
        get(mvc, "/api/badges/verify/pas-une-adresse/" + courseId, null).andExpect(status().isBadRequest());
        get(mvc, "/api/badges/verify/" + aliceWallet + "/0", null).andExpect(status().isBadRequest());
        get(mvc, "/api/badges/verify/" + aliceWallet + "/abc", null).andExpect(status().isBadRequest());

        // --- "mon espace" : le profil, les cours termines et les badges de la personne connectee
        get(mvc, "/api/me", alice)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("alice@example.com"))
                .andExpect(jsonPath("$.user.completedCourses.length()").value(1))
                .andExpect(jsonPath("$.badges.length()").value(1))
                .andExpect(jsonPath("$.nftBadges.length()").value(0));
        get(mvc, "/api/me", null).andExpect(status().isUnauthorized());

        // un eleve ne lit que ses propres badges ; l'ecole lit ceux de tout le monde
        get(mvc, "/api/badges/user/alice@example.com", alice)
                .andExpect(status().isOk()).andExpect(jsonPath("$.badges.length()").value(1));
        get(mvc, "/api/badges/user/ALICE@example.com", school)
                .andExpect(status().isOk()).andExpect(jsonPath("$.badges.length()").value(1));
        get(mvc, "/api/badges/user/ecole@test.example", alice).andExpect(status().isForbidden());
        get(mvc, "/api/badges/user/inconnu@example.com", school).andExpect(status().isNotFound());
    }

    @Test
    void configurationPubliqueSansSecret() throws Exception {
        String body = get(mvc, "/api/config", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.network").value("Ethereum Sepolia"))
                .andExpect(jsonPath("$.contractAddress").value("0x00000000000000000000000000000000000000c0"))
                .andExpect(jsonPath("$.explorer").value("https://sepolia.etherscan.io"))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("cle-factice").doesNotContain("privateKey").doesNotContain("password")
                .doesNotContain("secret").doesNotContain("MotDePasseEcole1");
    }

    @Test
    void preuvesDIntegrite() throws Exception {
        String school = TestAuth.school(mvc);
        String student = TestAuth.register(mvc, "preuves", "preuves@example.com", "motdepasse1").token();
        String expected = ProofService.sha256("Contrat v1");
        assertThat(expected).isEqualTo("fb0b068c45e4e615f633dd4d37a975daa6a5bcf7669256c33d2bf8c842a23e43");

        // graver : l'ecole seule
        post("/api/proofs", null, "{\"content\":\"Contrat v1\"}").andExpect(status().isUnauthorized());
        post("/api/proofs", student, "{\"content\":\"Contrat v1\"}").andExpect(status().isForbidden());
        post("/api/proofs", school, "{\"content\":\"Contrat v1\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.hash").value(expected))
                .andExpect(jsonPath("$.txHash").value("0xanchor1"))
                .andExpect(jsonPath("$.links.transaction").value("https://sepolia.etherscan.io/tx/0xanchor1"));

        // verifier : public. Meme texte : reconnu ; une seule lettre changee : empreinte inconnue
        post("/api/proofs/verify", null, "{\"content\":\"Contrat v1\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.computedHash").value(expected))
                .andExpect(jsonPath("$.anchoredAt").exists());
        post("/api/proofs/verify", null, "{\"content\":\"Contrat v2\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(false));

        // on ne grave pas deux fois la meme empreinte
        post("/api/proofs", school, "{\"content\":\"Contrat v1\"}").andExpect(status().isConflict());
        assertThat(chain.anchorCalls).isEqualTo(1);

        // le contrat refuse un appelant qui n'est pas l'ecole
        chain.callerIsOwner = false;
        post("/api/proofs", school, "{\"content\":\"Autre document\"}").andExpect(status().isUnprocessableEntity());
        chain.callerIsOwner = true;

        post("/api/proofs", school, "{\"content\":\"\"}").andExpect(status().isBadRequest());
        post("/api/proofs/verify", null, "{}").andExpect(status().isBadRequest());
    }

    @Test
    void preuveParEmpreinteCalculeeDansLeNavigateur() throws Exception {
        String school = TestAuth.school(mvc);
        String student = TestAuth.register(mvc, "empreinte", "empreinte@example.com", "motdepasse1").token();
        String hash = ProofService.sha256("Releve de notes du navigateur");
        String body = "{\"hash\":\"" + hash + "\"}";

        // graver : l'ecole seule ; l'empreinte seule est envoyee, le document ne quitte pas le navigateur
        post("/api/proofs/hash", null, body).andExpect(status().isUnauthorized());
        post("/api/proofs/hash", student, body).andExpect(status().isForbidden());
        post("/api/proofs/hash", school, body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.hash").value(hash))
                .andExpect(jsonPath("$.links.transaction").exists());
        post("/api/proofs/hash", school, body).andExpect(status().isConflict()); // meme regle que pour un texte

        // verifier : public, par l'empreinte, et aussi par le texte (meme empreinte, donc meme reponse)
        post("/api/proofs/hash/verify", null, body)
                .andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(true)).andExpect(jsonPath("$.anchoredAt").exists());
        post("/api/proofs/verify", null, "{\"content\":\"Releve de notes du navigateur\"}")
                .andExpect(jsonPath("$.valid").value(true));
        post("/api/proofs/hash/verify", null, "{\"hash\":\"" + ProofService.sha256("autre texte") + "\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(false));

        // une empreinte mal formee est refusee avant tout appel a la blockchain
        post("/api/proofs/hash", school, "{\"hash\":\"abc\"}").andExpect(status().isBadRequest());
        post("/api/proofs/hash", school, "{\"hash\":\"" + "z".repeat(64) + "\"}").andExpect(status().isBadRequest());
        post("/api/proofs/hash/verify", null, "{\"hash\":\"" + hash + "00\"}").andExpect(status().isBadRequest());
        post("/api/proofs/hash/verify", null, "{}").andExpect(status().isBadRequest());
    }
}
