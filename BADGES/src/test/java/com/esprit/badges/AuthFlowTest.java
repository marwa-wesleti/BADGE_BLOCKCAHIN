package com.esprit.badges;

import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.model.Role;
import com.esprit.badges.model.User;
import com.esprit.badges.repository.UserRepository;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static com.esprit.badges.TestAuth.get;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Connexion, roles, mots de passe et protection des routes. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:authflow;DB_CLOSE_DELAY=-1")
class AuthFlowTest {

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
    @Autowired PasswordEncoder encoder;

    private ResultActions post(String url, String token, String json) throws Exception {
        return TestAuth.post(mvc, url, token, json);
    }

    @Test
    void leCompteEcoleExisteAuDemarrageAvecLAdresseDuPortefeuilleEcole() {
        User school = users.findByEmail(TestAuth.SCHOOL_EMAIL).orElseThrow();
        assertThat(school.getRole()).isEqualTo(Role.ECOLE);
        assertThat(school.getWalletAddress()).isEqualTo(FakeEthereumService.SCHOOL_ADDRESS);
        // le mot de passe n'est jamais stocke en clair
        assertThat(school.getPasswordHash()).isNotEqualTo(TestAuth.SCHOOL_PASSWORD).startsWith("$2");
        assertThat(encoder.matches(TestAuth.SCHOOL_PASSWORD, school.getPasswordHash())).isTrue();
    }

    @Test
    void connexionEcoleEtEleve() throws Exception {
        post("/api/auth/login", null, TestAuth.loginJson(TestAuth.SCHOOL_EMAIL, TestAuth.SCHOOL_PASSWORD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("ECOLE"))
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.expiresInMinutes").value(480));

        TestAuth.register(mvc, "leila", "leila@example.com", "motdepasse1");
        post("/api/auth/login", null, TestAuth.loginJson("LEILA@example.com", "motdepasse1")) // e-mail insensible a la casse
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("ELEVE"))
                .andExpect(jsonPath("$.privateKey").doesNotExist()); // la cle n'est montree qu'a l'inscription
    }

    @Test
    void lesErreursDeConnexionNeRevelentPasQuiADuneCompte() throws Exception {
        TestAuth.register(mvc, "karim", "karim@example.com", "motdepasse1");
        String mauvaisMotDePasse = post("/api/auth/login", null, TestAuth.loginJson("karim@example.com", "faux-mot-de-passe"))
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        String emailInconnu = post("/api/auth/login", null, TestAuth.loginJson("personne@example.com", "motdepasse1"))
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(mauvaisMotDePasse, "$.message")).isEqualTo(JsonPath.<String>read(emailInconnu, "$.message"));
        post("/api/auth/login", null, "{\"email\":\"\",\"password\":\"\"}").andExpect(status().isBadRequest());
    }

    @Test
    void apresCinqEchecsLaConnexionEstFreinee() throws Exception {
        TestAuth.register(mvc, "nadia", "nadia@example.com", "motdepasse1");
        for (int i = 0; i < 5; i++) {
            post("/api/auth/login", null, TestAuth.loginJson("nadia@example.com", "mauvais-" + i)).andExpect(status().isUnauthorized());
        }
        // meme avec le bon mot de passe : bloque le temps de la fenetre
        post("/api/auth/login", null, TestAuth.loginJson("nadia@example.com", "motdepasse1")).andExpect(status().isTooManyRequests());
        // un autre compte n'est pas touche
        post("/api/auth/login", null, TestAuth.loginJson(TestAuth.SCHOOL_EMAIL, TestAuth.SCHOOL_PASSWORD)).andExpect(status().isOk());
    }

    @Test
    void lesRoutesSontProtegeesSelonLeRole() throws Exception {
        String school = TestAuth.school(mvc);
        String student = TestAuth.register(mvc, "samir", "samir@example.com", "motdepasse1").token();

        // sans jeton : 401 sur tout ce qui n'est pas public
        get(mvc, "/api/me", null).andExpect(status().isUnauthorized());
        get(mvc, "/api/courses", null).andExpect(status().isUnauthorized());
        get(mvc, "/api/school/students", null).andExpect(status().isUnauthorized());
        // un faux jeton ne vaut pas mieux qu'aucun jeton
        get(mvc, "/api/me", "pas.un.vrai.jeton").andExpect(status().isUnauthorized());

        // public : configuration et verifications
        get(mvc, "/api/config", null).andExpect(status().isOk());
        get(mvc, "/api/badges/verify/" + FakeEthereumService.addressNumber(1) + "/1", null).andExpect(status().isOk());
        get(mvc, "/api/nft-badges/verify/" + FakeEthereumService.addressNumber(1) + "/1", null).andExpect(status().isOk());

        // l'espace ecole est interdit a un eleve (403), ouvert a l'ecole
        get(mvc, "/api/school/overview", student).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false));
        get(mvc, "/api/school/students", student).andExpect(status().isForbidden());
        get(mvc, "/api/school/wallet", student).andExpect(status().isForbidden());
        get(mvc, "/api/school/overview", school).andExpect(status().isOk());

        // un eleve peut lire le catalogue de cours
        get(mvc, "/api/courses", student).andExpect(status().isOk());
    }

    @Test
    void lEcoleVoitSesElevesEtLesChiffresDeSonTableauDeBord() throws Exception {
        String school = TestAuth.school(mvc);
        TestAuth.register(mvc, "yasmine", "yasmine@example.com", "motdepasse1");

        get(mvc, "/api/school/students", school)
                .andExpect(status().isOk())
                // l'ecole elle-meme n'est pas dans la liste des eleves
                .andExpect(jsonPath("$.students[?(@.email=='" + TestAuth.SCHOOL_EMAIL + "')]").isEmpty())
                .andExpect(jsonPath("$.students[?(@.email=='yasmine@example.com')].hasPassword").value(true))
                .andExpect(jsonPath("$.students[?(@.email=='yasmine@example.com')].completedCourseIds[0]").isEmpty());
        get(mvc, "/api/school/overview", school)
                .andExpect(jsonPath("$.students").isNumber())
                .andExpect(jsonPath("$.completions").isNumber())
                .andExpect(jsonPath("$.nftContractAddress").value("0x00000000000000000000000000000000000000c1"));
        get(mvc, "/api/school/wallet", school)
                .andExpect(jsonPath("$.address").value(FakeEthereumService.SCHOOL_ADDRESS))
                .andExpect(jsonPath("$.balanceEth").value("1.5"));
    }

    @Test
    void lEcoleReinitialiseLeMotDePasseDUnAncienCompte() throws Exception {
        // un ancien compte, cree avant l'authentification : ni role ni mot de passe
        User old = users.save(new User("ancien", "ancien@example.com", FakeEthereumService.addressNumber(777)));
        assertThat(old.getPasswordHash()).isNull();
        assertThat(old.getRole()).isEqualTo(Role.ELEVE);
        post("/api/auth/login", null, TestAuth.loginJson("ancien@example.com", "nimportequoi")).andExpect(status().isUnauthorized());

        String school = TestAuth.school(mvc);
        String student = TestAuth.register(mvc, "curieux", "curieux@example.com", "motdepasse1").token();
        post("/api/school/students/" + old.getId() + "/reset-password", student, "{}").andExpect(status().isForbidden());

        String body = post("/api/school/students/" + old.getId() + "/reset-password", school, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.temporaryPassword").isNotEmpty())
                .andExpect(jsonPath("$.warning").value(containsString("plus jamais")))
                .andReturn().getResponse().getContentAsString();
        String temporary = JsonPath.read(body, "$.temporaryPassword");
        assertThat(temporary).hasSize(12);

        // le mot de passe temporaire fonctionne, il n'est stocke que haché
        TestAuth.login(mvc, "ancien@example.com", temporary);
        assertThat(users.findByEmail("ancien@example.com").orElseThrow().getPasswordHash()).doesNotContain(temporary);

        // on ne reinitialise ni un inconnu ni le compte de l'ecole
        post("/api/school/students/999999/reset-password", school, "{}").andExpect(status().isNotFound());
        Long schoolId = users.findByEmail(TestAuth.SCHOOL_EMAIL).orElseThrow().getId();
        post("/api/school/students/" + schoolId + "/reset-password", school, "{}").andExpect(status().isBadRequest());
    }

    @Test
    void lInscriptionRefuseLesMotsDePasseFaibles() throws Exception {
        String base = "{\"username\":\"faible\",\"email\":\"faible@example.com\",\"password\":\"";
        post("/api/auth/register", null, base + "court\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("8 caracteres")));
        post("/api/auth/register", null, base + "é".repeat(40) + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("trop long")));
        post("/api/auth/register", null, "{\"username\":\"faible\",\"email\":\"pas-un-email\",\"password\":\"motdepasse1\"}")
                .andExpect(status().isBadRequest());
        assertThat(users.findByEmail("faible@example.com")).isEmpty();
    }
}
