package com.esprit.badges.service;

import com.esprit.badges.blockchain.EthereumService;
import com.esprit.badges.web.ApiException;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;

@Service
public class ProofService {

    public record Anchor(String hash, EthereumService.TxResult tx) { }

    /** anchoredAt vide = cette empreinte n'a jamais ete gravee (document inconnu ou modifie). */
    public record Check(boolean valid, String computedHash, Instant anchoredAt) { }

    private final EthereumService ethereum;

    public ProofService(EthereumService ethereum) {
        this.ethereum = ethereum;
    }

    /**
     * Ancrage : on envoie au smart contract l'EMPREINTE (SHA-256) du texte, jamais le texte lui-meme.
     * Le reseau y ajoute la date du bloc, impossible a falsifier ensuite.
     */
    public Anchor anchor(String content) {
        byte[] hash = sha256Bytes(content);
        Optional<Instant> existing = ethereum.getDocumentAnchoredAt(hash);
        if (existing.isPresent()) {
            throw ApiException.conflict("Cette empreinte est deja gravee depuis " + existing.get());
        }
        return new Anchor(HexFormat.of().formatHex(hash), ethereum.anchorDocument(hash));
    }

    /**
     * Recalcule l'empreinte du texte presente et demande au contrat si elle a ete gravee.
     * Un seul caractere different = empreinte totalement differente = valid false.
     */
    public Check verify(String content) {
        byte[] hash = sha256Bytes(content);
        Optional<Instant> anchoredAt = ethereum.getDocumentAnchoredAt(hash);
        return new Check(anchoredAt.isPresent(), HexFormat.of().formatHex(hash), anchoredAt.orElse(null));
    }

    public static String sha256(String text) {
        return HexFormat.of().formatHex(sha256Bytes(text));
    }

    private static byte[] sha256Bytes(String text) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
