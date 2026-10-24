package com.esprit.badges;

import com.jayway.jsonpath.JsonPath;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Outils de test : se connecter, s'inscrire, et appeler l'API avec un jeton. */
final class TestAuth {

    static final String SCHOOL_EMAIL = "ecole@test.example";
    static final String SCHOOL_PASSWORD = "MotDePasseEcole1";

    /** Un eleve inscrit : son jeton, son adresse et la cle privee montree une seule fois. */
    record Student(String token, String wallet, String privateKey) { }

    private TestAuth() { }

    static String loginJson(String email, String password) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
    }

    /** Jeton de l'ecole (le compte est cree au demarrage a partir des reglages de test). */
    static String school(MockMvc mvc) throws Exception {
        return login(mvc, SCHOOL_EMAIL, SCHOOL_PASSWORD);
    }

    static String login(MockMvc mvc, String email, String password) throws Exception {
        String body = mvc.perform(MockMvcRequestBuilders.post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(loginJson(email, password)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }

    static Student register(MockMvc mvc, String username, String email, String password) throws Exception {
        String body = mvc.perform(MockMvcRequestBuilders.post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return new Student(JsonPath.read(body, "$.token"), JsonPath.read(body, "$.user.walletAddress"), JsonPath.read(body, "$.privateKey"));
    }

    static ResultActions post(MockMvc mvc, String url, String token, String json) throws Exception {
        var request = MockMvcRequestBuilders.post(url).contentType(MediaType.APPLICATION_JSON).content(json);
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return mvc.perform(request);
    }

    static ResultActions get(MockMvc mvc, String url, String token) throws Exception {
        var request = MockMvcRequestBuilders.get(url);
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return mvc.perform(request);
    }
}
