package com.esprit.badges.web;

import com.esprit.badges.model.NftBadge;
import com.esprit.badges.service.NftBadgeService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/** Badges NFT : memes routes que /api/badges, mais le contrat cree un jeton non transferable que l'eleve possede. */
@RestController
@RequestMapping("/api/nft-badges")
public class NftBadgeController {

    private static final Pattern ETH_ADDRESS = Pattern.compile("^0x[0-9a-fA-F]{40}$");

    public record IssueRequest(@NotBlank String email, @NotNull Long courseId) { }

    private final NftBadgeService nftBadgeService;

    public NftBadgeController(NftBadgeService nftBadgeService) {
        this.nftBadgeService = nftBadgeService;
    }

    /** POST /api/nft-badges/issue  { email, courseId } : le contrat cree le jeton et l'eleve en devient proprietaire. */
    @PostMapping("/issue")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> issue(@Valid @RequestBody IssueRequest request) {
        NftBadge badge = nftBadgeService.issue(request.email(), request.courseId());
        return Api.ok(
                "message", "Badge NFT cree par le smart contract",
                "badge", Views.nftBadge(badge),
                "links", Views.nftLinks(badge.getTxHash(), badge.getContractAddress(), badge.getTokenId()));
    }

    /** GET /api/nft-badges/user/{email} */
    @GetMapping("/user/{email}")
    public Map<String, Object> listForUser(@PathVariable String email) {
        return Api.ok("badges", nftBadgeService.listForUser(email).stream().map(Views::nftBadge).toList());
    }

    /**
     * GET /api/nft-badges/verify/{walletAddress}/{courseId} : verification publique, lue dans le smart contract.
     * Repond toujours 200 : valid=false signifie "ce badge n'existe pas sur la blockchain".
     */
    @GetMapping("/verify/{walletAddress}/{courseId}")
    public Map<String, Object> verify(@PathVariable String walletAddress, @PathVariable long courseId) {
        if (!ETH_ADDRESS.matcher(walletAddress).matches()) {
            throw ApiException.badRequest("Adresse invalide : 0x suivi de 40 caracteres hexadecimaux attendus");
        }
        if (courseId < 1) {
            throw ApiException.badRequest("courseId invalide");
        }
        NftBadgeService.Verification v = nftBadgeService.verify(walletAddress, courseId);

        Map<String, Object> onChain = new LinkedHashMap<>();
        onChain.put("walletAddress", v.walletAddress());
        onChain.put("courseId", v.courseId());
        onChain.put("tokenId", v.onChain() == null ? null : v.onChain().tokenId());
        onChain.put("owner", v.onChain() == null ? null : v.onChain().owner());
        onChain.put("issuedAt", v.onChain() == null ? null : v.onChain().issuedAt());

        Map<String, Object> database = null;
        if (v.badge() != null) {
            database = new LinkedHashMap<>();
            database.put("user", v.badge().getUser().getUsername());
            database.put("course", v.badge().getCourse().getTitle());
            database.put("txHash", v.badge().getTxHash());
        }

        return Api.ok(
                "valid", v.valid(),
                "onChain", onChain,
                "database", database);
    }
}
