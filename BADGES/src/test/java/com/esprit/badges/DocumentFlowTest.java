package com.esprit.badges;

import com.esprit.badges.blockchain.EthereumProperties;
import com.jayway.jsonpath.JsonPath;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import com.esprit.badges.repository.IssuedDocumentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

import static com.esprit.badges.TestAuth.get;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Documents emis par l'ecole : emission, registre, "mes documents" et certificat PDF, avec un Ethereum simule. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:documents;DB_CLOSE_DELAY=-1") // base separee des autres tests
class DocumentFlowTest {

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
    @Autowired IssuedDocumentRepository documents;

    /** Les tests partagent la base et le faux reseau : chacun repart de zero (les comptes, eux, ont des noms distincts). */
    @BeforeEach
    void reset() {
        documents.deleteAll();
        chain.documentDates.clear();
        chain.anchorCalls = 0;
        chain.callerIsOwner = true;
    }

    private ResultActions post(String url, String token, String json) throws Exception {
        return TestAuth.post(mvc, url, token, json);
    }

    private static String sha256(String text) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
    }

    private static String issueBody(String title, String type, Object studentId, String hash) {
        return "{\"title\":\"" + title + "\",\"type\":" + (type == null ? "null" : "\"" + type + "\"")
                + ",\"studentId\":" + studentId + ",\"hash\":\"" + hash + "\"}";
    }

    private int studentId(String token) throws Exception {
        String body = get(mvc, "/api/me", token).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.user.id");
    }

    private static String text(byte[] pdf) throws Exception {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return new PDFTextStripper().getText(document);
        }
    }

    @Test
    void scenarioCompletDuDocumentEmisAUnEleve() throws Exception {
        TestAuth.Student marie = TestAuth.register(mvc, "marie", "marie@example.com", "motdepasse1");
        TestAuth.Student paul = TestAuth.register(mvc, "paul", "paul@example.com", "motdepasse1");
        String school = TestAuth.school(mvc);
        int marieId = studentId(marie.token());
        String hash = sha256("Diplome de Marie 2026");

        // --- seule l'ecole emet un document
        String request = issueBody("Diplôme de Marie", "DIPLOME", marieId, hash);
        post("/api/documents", null, request).andExpect(status().isUnauthorized());
        post("/api/documents", marie.token(), request).andExpect(status().isForbidden());
        assertThat(chain.anchorCalls).isZero();

        // --- tout est verifie AVANT d'ecrire sur la blockchain : une ecriture est publique et permanente
        post("/api/documents", school, issueBody("   ", "DIPLOME", marieId, hash)).andExpect(status().isBadRequest());
        post("/api/documents", school, issueBody("x".repeat(121), "DIPLOME", marieId, hash)).andExpect(status().isBadRequest());
        post("/api/documents", school, issueBody("Titre", "DIPLOME", marieId, "pas-une-empreinte")).andExpect(status().isBadRequest());
        post("/api/documents", school, issueBody("Titre", "TYPE_INCONNU", marieId, hash)).andExpect(status().isBadRequest());
        post("/api/documents", school, issueBody("Titre", "DIPLOME", 987654, hash)).andExpect(status().isNotFound());
        post("/api/documents", school, issueBody("Titre", "DIPLOME", studentId(school), hash)) // le compte ecole n'est pas un eleve
                .andExpect(status().isNotFound());
        assertThat(chain.anchorCalls).isZero();

        // --- emission : l'empreinte est gravee et le document enregistre
        post("/api/documents", school, request)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.document.title").value("Diplôme de Marie"))
                .andExpect(jsonPath("$.document.type").value("DIPLOME"))
                .andExpect(jsonPath("$.document.hash").value(hash))
                .andExpect(jsonPath("$.document.student.email").value("marie@example.com"))
                .andExpect(jsonPath("$.document.student.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.document.txHash").value("0xanchor1"))
                .andExpect(jsonPath("$.document.blockTime").value(FakeEthereumService.TIME))
                .andExpect(jsonPath("$.links.transaction").value("https://sepolia.etherscan.io/tx/0xanchor1"));
        assertThat(chain.anchorCalls).isEqualTo(1);

        // --- la meme empreinte, meme ecrite en majuscules, est refusee sans nouvelle transaction
        post("/api/documents", school, issueBody("Autre titre", "AUTRE", "null", hash.toUpperCase())).andExpect(status().isConflict());
        assertThat(chain.anchorCalls).isEqualTo(1);

        // --- le contrat refuse l'appelant : rien n'est enregistre en base
        chain.callerIsOwner = false;
        post("/api/documents", school, issueBody("Releve", "RELEVE", marieId, sha256("Releve")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value(containsString("Seule l'ecole peut effectuer cette action")));
        chain.callerIsOwner = true;

        // --- un document sans destinataire (archive de l'ecole) ; le type par defaut est AUTRE
        post("/api/documents", school, issueBody("Procès-verbal du jury", null, "null", sha256("PV jury")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.document.type").value("AUTRE"))
                .andExpect(jsonPath("$.document.student").doesNotExist());

        // --- le registre : l'ecole voit tout, les plus recents d'abord ; un eleve n'y a pas acces
        get(mvc, "/api/school/documents", school)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.documents.length()").value(2))
                .andExpect(jsonPath("$.documents[0].title").value("Procès-verbal du jury"))
                .andExpect(jsonPath("$.documents[1].title").value("Diplôme de Marie"));
        get(mvc, "/api/school/documents", marie.token()).andExpect(status().isForbidden());
        get(mvc, "/api/school/documents", null).andExpect(status().isUnauthorized());

        // --- "mes documents" : chacun ne voit que les siens
        get(mvc, "/api/me/documents", marie.token())
                .andExpect(jsonPath("$.documents.length()").value(1))
                .andExpect(jsonPath("$.documents[0].hash").value(hash));
        get(mvc, "/api/me/documents", paul.token()).andExpect(jsonPath("$.documents.length()").value(0));
        get(mvc, "/api/me/documents", null).andExpect(status().isUnauthorized());

        // --- le document est aussi verifiable publiquement, comme n'importe quelle empreinte
        post("/api/proofs/hash/verify", null, "{\"hash\":\"" + hash + "\"}")
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.anchoredAt").value(FakeEthereumService.TIME));
    }

    @Test
    void leCertificatPdfContientLaPreuveEtNEstRemisQuAuProprietaire() throws Exception {
        TestAuth.Student lea = TestAuth.register(mvc, "lea", "lea@example.com", "motdepasse1");
        TestAuth.Student omar = TestAuth.register(mvc, "omar", "omar@example.com", "motdepasse1");
        String school = TestAuth.school(mvc);
        String hash = sha256("Releve de Lea");
        String created = post("/api/documents", school, issueBody("Relevé de notes S1", "RELEVE", studentId(lea.token()), hash))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.document.id");

        // --- l'eleve proprietaire et l'ecole le telechargent ; un autre eleve ou un inconnu, non
        byte[] pdf = get(mvc, "/api/documents/" + id + "/certificate", lea.token())
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_PDF_VALUE))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("certificat-releve-de-notes-s1.pdf")))
                .andReturn().getResponse().getContentAsByteArray();
        get(mvc, "/api/documents/" + id + "/certificate", school).andExpect(status().isOk());
        get(mvc, "/api/documents/" + id + "/certificate", omar.token()).andExpect(status().isForbidden());
        get(mvc, "/api/documents/" + id + "/certificate", null).andExpect(status().isUnauthorized());
        get(mvc, "/api/documents/" + java.util.UUID.randomUUID() + "/certificate", school).andExpect(status().isNotFound());
        get(mvc, "/api/documents/pas-un-identifiant/certificate", school).andExpect(status().isBadRequest());

        // --- c'est un vrai PDF qui porte la preuve : titre, destinataire, empreinte, transaction, contrat et lien de verification
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        String content = text(pdf);
        String flat = content.replaceAll("\\s", "");
        assertThat(content).contains("Certificat de preuve d'intégrité", "Relevé de notes S1", "Relevé de notes", "lea (lea@example.com)");
        assertThat(flat).contains(hash, "0xanchor1", "0x00000000000000000000000000000000000000c0",
                "http://localhost/#/verifier?type=document&hash=" + hash);
        assertThat(content).contains("10/10/2026 10:00:00 UTC", "Ethereum Sepolia");
        // le contenu du document n'est nulle part : le serveur ne l'a jamais recu
        assertThat(content).doesNotContain("Releve de Lea");
    }

    @Test
    void unTitreAvecDesCaracteresNonLatinsNeFaitPasEchouerLeCertificat() throws Exception {
        String school = TestAuth.school(mvc);
        String created = post("/api/documents", school, issueBody("شهادة 🎓 Diplôme", "DIPLOME", "null", sha256("exotique")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.document.id");

        byte[] pdf = get(mvc, "/api/documents/" + id + "/certificate", school).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(text(pdf)).contains("Diplôme").contains("Aucun destinataire");
    }

    @Test
    void leQrCodeUtiliseLAdressePubliqueDeLaRequete() throws Exception {
        String school = TestAuth.school(mvc);
        String hash = sha256("adresse publique");
        String created = post("/api/documents", school, issueBody("Attestation", "ATTESTATION", "null", hash))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.document.id");

        byte[] pdf = mvc.perform(MockMvcRequestBuilders.get("/api/documents/" + id + "/certificate")
                        .header("Authorization", "Bearer " + school)
                        .with(request -> {
                            request.setServerName("badges.exemple.org");
                            request.setServerPort(443);
                            request.setScheme("https");
                            return request;
                        }))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertThat(text(pdf).replaceAll("\\s", "")).contains("https://badges.exemple.org/#/verifier?type=document&hash=" + hash);
    }
}
