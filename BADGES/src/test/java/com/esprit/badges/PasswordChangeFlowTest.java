package com.esprit.badges;

import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.repository.UserRepository;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static com.esprit.badges.TestAuth.get;
import static com.esprit.badges.TestAuth.loginJson;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Mot de passe temporaire : l'ecole le genere, l'eleve DOIT en choisir un autre a sa premiere connexion.
 * La regle est appliquee par le serveur : tant que ce n'est pas fait, tout est refuse sauf le changement lui-meme.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:passwordchange;DB_CLOSE_DELAY=-1")
class PasswordChangeFlowTest {

    @TestConfiguration
    static class FakeConfig {
        @Bean
        @Primary
        FakeEthereumService fakeEthereum(EthereumProperties props) {
            return new FakeEthereumService(props);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;

    private ResultActions post(String url, String token, String json) throws Exception {
        return TestAuth.post(mvc, url, token, json);
    }

    private static String change(String current, String next) {
        return "{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next + "\"}";
    }

    /** L'ecole reinitialise le mot de passe de cet eleve ; rend le mot de passe temporaire. */
    private String resetBySchool(String school, String email) throws Exception {
        long id = users.findByEmail(email).orElseThrow().getId();
        String body = post("/api/school/students/" + id + "/reset-password", school, "{}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.temporaryPassword");
    }

    @Test
    void scenarioCompletDeLaPremiereConnexionApresReinitialisation() throws Exception {
        TestAuth.Student ines = TestAuth.register(mvc, "ines", "ines@example.com", "ancienmotdepasse1");
        String school = TestAuth.school(mvc);
        get(mvc, "/api/courses", ines.token()).andExpect(status().isOk());
        get(mvc, "/api/me", ines.token()).andExpect(jsonPath("$.user.mustChangePassword").value(false));

        // --- l'ecole genere un mot de passe temporaire : l'ecole voit qu'il est en attente
        String temporary = resetBySchool(school, "ines@example.com");
        get(mvc, "/api/school/students", school)
                .andExpect(jsonPath("$.students[?(@.email=='ines@example.com')].mustChangePassword").value(true));

        // --- l'ancien mot de passe ne marche plus ; le temporaire marche, et la reponse annonce qu'il faut le changer
        post("/api/auth/login", null, loginJson("ines@example.com", "ancienmotdepasse1")).andExpect(status().isUnauthorized());
        String login = post("/api/auth/login", null, loginJson("ines@example.com", temporary))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.mustChangePassword").value(true))
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(login, "$.token");

        // --- tant qu'elle n'a pas choisi le sien : seuls son profil et la configuration restent lisibles
        get(mvc, "/api/me", token).andExpect(status().isOk()).andExpect(jsonPath("$.user.mustChangePassword").value(true));
        get(mvc, "/api/config", token).andExpect(status().isOk());
        for (String url : new String[]{"/api/courses", "/api/me/documents", "/api/badges/user/ines@example.com", "/api/badges/verify/"
                + FakeEthereumService.addressNumber(1) + "/1"}) {
            get(mvc, url, token)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.passwordChangeRequired").value(true))
                    .andExpect(jsonPath("$.message").value(containsString("nouveau mot de passe")));
        }
        // meme un jeton obtenu AVANT la reinitialisation est bloque : la regle est appliquee par le serveur, pas par l'interface
        get(mvc, "/api/courses", ines.token()).andExpect(status().isForbidden()).andExpect(jsonPath("$.passwordChangeRequired").value(true));

        // --- changement refuse : mauvais mot de passe actuel, trop court, identique a l'actuel
        post("/api/auth/change-password", token, change("pas-le-bon", "nouveaumotdepasse1"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value(containsString("actuel incorrect")));
        post("/api/auth/change-password", token, change(temporary, "court"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(containsString("8 caracteres")));
        post("/api/auth/change-password", token, change(temporary, temporary))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(containsString("different")));
        get(mvc, "/api/courses", token).andExpect(status().isForbidden()); // toujours bloque

        // --- changement accepte : plus rien n'est bloque, avec le meme jeton
        post("/api/auth/change-password", token, change(temporary, "nouveaumotdepasse1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.mustChangePassword").value(false))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist());
        get(mvc, "/api/courses", token).andExpect(status().isOk());
        get(mvc, "/api/me/documents", token).andExpect(status().isOk());
        get(mvc, "/api/me", ines.token()).andExpect(jsonPath("$.user.mustChangePassword").value(false));
        get(mvc, "/api/school/students", school)
                .andExpect(jsonPath("$.students[?(@.email=='ines@example.com')].mustChangePassword").value(false));

        // --- le temporaire ne marche plus, le nouveau marche, et il n'est stocke que hache
        post("/api/auth/login", null, loginJson("ines@example.com", temporary)).andExpect(status().isUnauthorized());
        post("/api/auth/login", null, loginJson("ines@example.com", "nouveaumotdepasse1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.mustChangePassword").value(false));
        assertThat(users.findByEmail("ines@example.com").orElseThrow().getPasswordHash()).doesNotContain("nouveaumotdepasse1").startsWith("$2");
    }

    @Test
    void unEleveSansReinitialisationPeutAussiChangerSonMotDePasse() throws Exception {
        TestAuth.Student omar = TestAuth.register(mvc, "omar2", "omar2@example.com", "motdepasse1");
        post("/api/auth/change-password", omar.token(), change("motdepasse1", "autremotdepasse2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.mustChangePassword").value(false));
        post("/api/auth/login", null, loginJson("omar2@example.com", "motdepasse1")).andExpect(status().isUnauthorized());
        post("/api/auth/login", null, loginJson("omar2@example.com", "autremotdepasse2")).andExpect(status().isOk());
    }

    @Test
    void personneNeChangeLeMotDePasseSansEtreConnecteOuPourLEcole() throws Exception {
        post("/api/auth/change-password", null, change("x", "nouveaumotdepasse1")).andExpect(status().isUnauthorized());

        // le mot de passe de l'ecole vient du .env (reapplique a chaque demarrage) : il ne se change pas ici
        post("/api/auth/change-password", TestAuth.school(mvc), change(TestAuth.SCHOOL_PASSWORD, "nouveaumotdepasse1"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value(containsString(".env")));
        post("/api/auth/login", null, loginJson(TestAuth.SCHOOL_EMAIL, TestAuth.SCHOOL_PASSWORD)).andExpect(status().isOk());
    }

    @Test
    void lesEssaisRatesDuMotDePasseActuelSontFreines() throws Exception {
        TestAuth.Student lea = TestAuth.register(mvc, "lea2", "lea2@example.com", "motdepasse1");
        for (int i = 0; i < 5; i++) {
            post("/api/auth/change-password", lea.token(), change("faux" + i + "faux", "nouveaumotdepasse1")).andExpect(status().isUnauthorized());
        }
        // meme avec le BON mot de passe, on attend : sinon le frein ne servirait a rien
        post("/api/auth/change-password", lea.token(), change("motdepasse1", "nouveaumotdepasse1")).andExpect(status().isTooManyRequests());
        post("/api/auth/login", null, loginJson("lea2@example.com", "motdepasse1")).andExpect(status().isOk()); // la connexion, elle, a son propre compteur
    }

    @Test
    void lEcoleCreeLeCompteDUnEleveQuiDoitChoisirSonMotDePasseAuDebut() throws Exception {
        String school = TestAuth.school(mvc);
        TestAuth.Student curieux = TestAuth.register(mvc, "curieux2", "curieux2@example.com", "motdepasse1");

        // --- seule l'ecole cree un compte eleve
        String request = "{\"username\":\"nadia\",\"email\":\"Nadia@Example.com\"}";
        post("/api/school/students", null, request).andExpect(status().isUnauthorized());
        post("/api/school/students", curieux.token(), request).andExpect(status().isForbidden());
        assertThat(users.findByEmail("nadia@example.com")).isEmpty();

        // --- saisies refusees : pseudo trop court, e-mail invalide, champs vides
        post("/api/school/students", school, "{\"username\":\"ab\",\"email\":\"x@example.com\"}").andExpect(status().isBadRequest());
        post("/api/school/students", school, "{\"username\":\"nadia\",\"email\":\"pas-un-email\"}").andExpect(status().isBadRequest());
        post("/api/school/students", school, "{\"username\":\"\",\"email\":\"\"}").andExpect(status().isBadRequest());

        // --- creation : portefeuille, mot de passe temporaire et cle privee, montres une seule fois
        String body = post("/api/school/students", school, request)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.username").value("nadia"))
                .andExpect(jsonPath("$.user.email").value("nadia@example.com")) // e-mail normalise
                .andExpect(jsonPath("$.user.role").value("ELEVE"))
                .andExpect(jsonPath("$.user.mustChangePassword").value(true))
                .andExpect(jsonPath("$.user.walletAddress").value(org.hamcrest.Matchers.matchesPattern("^0x[0-9a-f]{40}$")))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.temporaryPassword").isNotEmpty())
                .andExpect(jsonPath("$.privateKey").isNotEmpty())
                .andExpect(jsonPath("$.warning").value(containsString("plus jamais")))
                .andReturn().getResponse().getContentAsString();
        String temporary = JsonPath.read(body, "$.temporaryPassword");
        String wallet = JsonPath.read(body, "$.user.walletAddress");
        assertThat(temporary).hasSize(12);
        assertThat(wallet).isNotEqualTo(FakeEthereumService.SCHOOL_ADDRESS.toLowerCase());

        // --- le mot de passe n'est stocke que hache, et la cle privee n'est stockee nulle part ni redonnee ensuite
        assertThat(users.findByEmail("nadia@example.com").orElseThrow().getPasswordHash()).doesNotContain(temporary).startsWith("$2");
        get(mvc, "/api/school/students", school)
                .andExpect(jsonPath("$.students[?(@.email=='nadia@example.com')].privateKey").isEmpty())
                .andExpect(jsonPath("$.students[?(@.email=='nadia@example.com')].mustChangePassword").value(true))
                .andExpect(jsonPath("$.students[?(@.email=='nadia@example.com')].hasPassword").value(true));

        // --- doublons : meme e-mail (meme avec une autre casse) ou meme pseudo
        post("/api/school/students", school, "{\"username\":\"autre\",\"email\":\"NADIA@example.com\"}").andExpect(status().isConflict());
        post("/api/school/students", school, "{\"username\":\"nadia\",\"email\":\"autre@example.com\"}").andExpect(status().isConflict());
        post("/api/school/students", school, "{\"username\":\"curieux2\",\"email\":\"autre2@example.com\"}").andExpect(status().isConflict());

        // --- l'eleve se connecte avec le temporaire : bloque jusqu'a ce qu'il choisisse son mot de passe
        String token = TestAuth.login(mvc, "nadia@example.com", temporary);
        get(mvc, "/api/me", token).andExpect(jsonPath("$.user.mustChangePassword").value(true));
        get(mvc, "/api/courses", token).andExpect(status().isForbidden()).andExpect(jsonPath("$.passwordChangeRequired").value(true));
        post("/api/auth/change-password", token, change(temporary, "ChoisiParNadia9")).andExpect(status().isOk());
        get(mvc, "/api/courses", token).andExpect(status().isOk());
        post("/api/auth/login", null, loginJson("nadia@example.com", temporary)).andExpect(status().isUnauthorized());
        post("/api/auth/login", null, loginJson("nadia@example.com", "ChoisiParNadia9")).andExpect(status().isOk());
    }

    @Test
    void uneNouvelleReinitialisationExigeDeNouveauUnChangement() throws Exception {
        TestAuth.Student sami = TestAuth.register(mvc, "sami", "sami@example.com", "motdepasse1");
        String school = TestAuth.school(mvc);
        String first = resetBySchool(school, "sami@example.com");
        post("/api/auth/change-password", TestAuth.login(mvc, "sami@example.com", first), change(first, "choisiparsami1")).andExpect(status().isOk());
        get(mvc, "/api/courses", sami.token()).andExpect(status().isOk());

        String second = resetBySchool(school, "sami@example.com");
        assertThat(second).isNotEqualTo(first);
        get(mvc, "/api/courses", sami.token()).andExpect(status().isForbidden()); // de nouveau bloque
    }
}
