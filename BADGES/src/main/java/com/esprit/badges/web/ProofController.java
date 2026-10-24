package com.esprit.badges.web;

import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.service.ProofService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/proofs")
public class ProofController {

    public record AnchorRequest(@NotBlank String content) { }

    public record VerifyRequest(@NotNull String content) { }

    public record HashRequest(@NotBlank String hash) { }

    private final ProofService proofService;
    private final EthereumProperties props;

    public ProofController(ProofService proofService, EthereumProperties props) {
        this.proofService = proofService;
        this.props = props;
    }

    /** POST /api/proofs  { content } : grave l'empreinte SHA-256 du texte dans le smart contract. */
    @PostMapping
    public ResponseEntity<Map<String, Object>> anchor(@Valid @RequestBody AnchorRequest request) {
        return created(proofService.anchor(request.content()));
    }

    /** POST /api/proofs/hash  { hash } : meme chose, avec une empreinte deja calculee (le document ne quitte pas le navigateur). */
    @PostMapping("/hash")
    public ResponseEntity<Map<String, Object>> anchorHash(@Valid @RequestBody HashRequest request) {
        return created(proofService.anchorHex(request.hash()));
    }

    private ResponseEntity<Map<String, Object>> created(ProofService.Anchor anchor) {
        Map<String, Object> body = Api.ok(
                "hash", anchor.hash(),
                "contractAddress", props.contractAddress(),
                "txHash", anchor.tx().transactionHash(),
                "blockNumber", anchor.tx().blockNumber(),
                "blockTime", anchor.tx().blockTime(),
                "links", Views.txLinks(anchor.tx().transactionHash(), props.contractAddress()));
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    /**
     * POST /api/proofs/verify  { content } : le texte est-il identique a celui dont l'empreinte a ete gravee ?
     * Repond toujours 200 : valid=false = empreinte jamais gravee (texte inconnu ou modifie).
     */
    @PostMapping("/verify")
    public Map<String, Object> verify(@Valid @RequestBody VerifyRequest request) {
        return checked(proofService.verify(request.content()));
    }

    /** POST /api/proofs/hash/verify  { hash } : verification publique d'une empreinte calculee dans le navigateur. */
    @PostMapping("/hash/verify")
    public Map<String, Object> verifyHash(@Valid @RequestBody HashRequest request) {
        return checked(proofService.verifyHex(request.hash()));
    }

    private Map<String, Object> checked(ProofService.Check c) {
        return Api.ok(
                "valid", c.valid(),
                "computedHash", c.computedHash(),
                "anchoredAt", c.anchoredAt());
    }
}
