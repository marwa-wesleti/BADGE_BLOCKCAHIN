package com.esprit.badges.web;

import com.esprit.badges.model.DocumentType;
import com.esprit.badges.model.IssuedDocument;
import com.esprit.badges.security.AuthUser;
import com.esprit.badges.service.CertificateService;
import com.esprit.badges.service.DocumentService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Documents emis par l'ecole. Seule l'ecole en emet (voir SecurityConfig) ; un eleve ne voit que ceux qui lui sont remis.
 * Le document n'arrive jamais ici : le navigateur n'envoie que son empreinte SHA-256.
 */
@RestController
public class DocumentController {

    public record IssueRequest(@NotBlank String title, DocumentType type, Long studentId, @NotBlank String hash) { }

    private final DocumentService documents;
    private final CertificateService certificates;
    private final String publicUrl;

    public DocumentController(DocumentService documents, CertificateService certificates,
                              @Value("${app.public-url:}") String publicUrl) {
        this.documents = documents;
        this.certificates = certificates;
        this.publicUrl = publicUrl == null ? "" : publicUrl.trim();
    }

    /** POST /api/documents  { title, type, studentId?, hash } : grave l'empreinte et enregistre le document. */
    @PostMapping("/api/documents")
    public ResponseEntity<Map<String, Object>> issue(@Valid @RequestBody IssueRequest request) {
        IssuedDocument document = documents.issue(request.title(), request.type(), request.studentId(), request.hash());
        return ResponseEntity.status(HttpStatus.CREATED).body(Api.ok(
                "message", "Document emis : son empreinte est gravee sur la blockchain",
                "document", Views.document(document),
                "links", Views.txLinks(document.getTxHash(), document.getContractAddress())));
    }

    /** GET /api/school/documents : le registre de l'ecole (reserve a l'ecole par SecurityConfig). */
    @GetMapping("/api/school/documents")
    public Map<String, Object> all() {
        return Api.ok("documents", documents.listAll().stream().map(Views::document).toList());
    }

    /** GET /api/me/documents : les documents remis a la personne connectee. */
    @GetMapping("/api/me/documents")
    public Map<String, Object> mine(@AuthenticationPrincipal AuthUser me) {
        return Api.ok("documents", documents.listForUser(me.email()).stream().map(Views::document).toList());
    }

    /** GET /api/documents/{id}/certificate : le certificat PDF, pour l'ecole ou pour l'eleve a qui le document est remis. */
    @GetMapping("/api/documents/{id}/certificate")
    public ResponseEntity<byte[]> certificate(@PathVariable UUID id, @AuthenticationPrincipal AuthUser me) {
        IssuedDocument document = documents.getFor(id, me.email(), me.role());
        byte[] pdf = certificates.generate(document, baseUrl());
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("certificat-" + slug(document.getTitle()) + ".pdf").build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pdf);
    }

    /** Adresse du site pour le QR code : reglage PUBLIC_URL, sinon celle par laquelle la requete est arrivee. */
    private String baseUrl() {
        return publicUrl.isEmpty() ? ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString() : publicUrl;
    }

    /** "Diplôme Marwa 2026" donne "diplome-marwa-2026" : un nom de fichier sans accent ni caractere special. */
    static String slug(String title) {
        String ascii = Normalizer.normalize(title, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        String slug = ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        if (slug.length() > 40) {
            slug = slug.substring(0, 40).replaceAll("-+$", "");
        }
        return slug.isEmpty() ? "document" : slug;
    }
}
