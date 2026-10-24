package com.esprit.badges.service;

import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.model.DocumentType;
import com.esprit.badges.model.IssuedDocument;
import com.esprit.badges.model.Role;
import com.esprit.badges.model.User;
import com.esprit.badges.repository.IssuedDocumentRepository;
import com.esprit.badges.repository.UserRepository;
import com.esprit.badges.web.ApiException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Documents emis par l'ecole : on grave l'empreinte dans le contrat (ProofService), puis on garde la trace en base
 * pour pouvoir les lister, les rattacher a un eleve et produire leur certificat.
 */
@Service
public class DocumentService {

    static final int MAX_TITLE = 120;

    private final ProofService proofs;
    private final IssuedDocumentRepository documents;
    private final UserRepository users;
    private final EthereumProperties props;

    public DocumentService(ProofService proofs, IssuedDocumentRepository documents, UserRepository users, EthereumProperties props) {
        this.proofs = proofs;
        this.documents = documents;
        this.users = users;
        this.props = props;
    }

    /**
     * Verifie tout ce qui peut l'etre AVANT d'ecrire sur la blockchain (une ecriture est publique et permanente),
     * puis grave l'empreinte et enregistre la trace.
     */
    public IssuedDocument issue(String title, DocumentType type, Long studentId, String hash) {
        String cleanTitle = title == null ? "" : title.strip();
        if (cleanTitle.isEmpty()) {
            throw ApiException.badRequest("Le titre du document est obligatoire");
        }
        if (cleanTitle.length() > MAX_TITLE) {
            throw ApiException.badRequest("Le titre est trop long (" + MAX_TITLE + " caracteres maximum)");
        }
        String normalizedHash = normalize(hash);
        User student = null;
        if (studentId != null) {
            student = users.findById(studentId)
                    .filter(u -> u.getRole() == Role.ELEVE)
                    .orElseThrow(() -> ApiException.notFound("Eleve introuvable"));
        }
        if (documents.existsByHash(normalizedHash)) {
            throw ApiException.conflict("Ce document a deja ete emis : son empreinte est deja gravee");
        }

        ProofService.Anchor anchor = proofs.anchorHex(normalizedHash);
        return documents.save(new IssuedDocument(
                cleanTitle, type == null ? DocumentType.AUTRE : type, anchor.hash(), student,
                props.contractAddress(), anchor.tx().transactionHash(), anchor.tx().blockNumber(), anchor.tx().blockTime()));
    }

    /** Tous les documents emis, les plus recents d'abord (vue de l'ecole). */
    public List<IssuedDocument> listAll() {
        return documents.findAllByOrderByCreatedAtDesc();
    }

    /** Les documents remis a cet utilisateur. */
    public List<IssuedDocument> listForUser(String email) {
        User user = users.findByEmail(UserService.normalize(email)).orElseThrow(() -> ApiException.notFound("Utilisateur introuvable"));
        return documents.findByStudentIdOrderByCreatedAtDesc(user.getId());
    }

    /** Un document, si la personne a le droit de le voir : l'ecole voit tout, un eleve seulement les siens. */
    public IssuedDocument getFor(UUID id, String email, Role role) {
        IssuedDocument document = documents.findById(id).orElseThrow(() -> ApiException.notFound("Document introuvable"));
        boolean owner = document.getStudent() != null && document.getStudent().getEmail().equalsIgnoreCase(email);
        if (role != Role.ECOLE && !owner) {
            throw ApiException.forbidden("Ce document ne vous appartient pas");
        }
        return document;
    }

    private static String normalize(String hash) {
        if (hash == null || !hash.matches("^[0-9a-fA-F]{64}$")) {
            throw ApiException.badRequest("Empreinte invalide : 64 caracteres hexadecimaux attendus (SHA-256)");
        }
        return hash.toLowerCase(Locale.ROOT);
    }
}
