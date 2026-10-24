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
        return anchorHash(sha256Bytes(content));
    }

    /**
     * Meme ancrage, quand l'empreinte a deja ete calculee ailleurs (dans le navigateur) : le document, texte
     * ou fichier, ne quitte alors jamais l'ordinateur de la personne.
     */
    public Anchor anchorHex(String sha256Hex) {
        return anchorHash(parseHash(sha256Hex));
    }

    private Anchor anchorHash(byte[] hash) {
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
        return verifyHash(sha256Bytes(content));
    }

    /** Verification d'une empreinte deja calculee (64 caracteres hexadecimaux). */
    public Check verifyHex(String sha256Hex) {
        return verifyHash(parseHash(sha256Hex));
    }

    private Check verifyHash(byte[] hash) {
        Optional<Instant> anchoredAt = ethereum.getDocumentAnchoredAt(hash);
        return new Check(anchoredAt.isPresent(), HexFormat.of().formatHex(hash), anchoredAt.orElse(null));
    }

    /** 64 caracteres hexadecimaux (32 octets) : rien d'autre n'est accepte, pour ne pas graver n'importe quoi. */
    static byte[] parseHash(String hex) {
        if (hex == null || !hex.matches("^[0-9a-fA-F]{64}$")) {
            throw ApiException.badRequest("Empreinte invalide : 64 caracteres hexadecimaux attendus (SHA-256)");
        }
        return HexFormat.of().parseHex(hex);
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
