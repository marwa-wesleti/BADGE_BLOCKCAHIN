package com.esprit.badges.web;

import com.esprit.badges.model.Badge;
import com.esprit.badges.model.Role;
import com.esprit.badges.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import com.esprit.badges.service.BadgeService;
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

@RestController
@RequestMapping("/api/badges")
public class BadgeController {

    private static final Pattern ETH_ADDRESS = Pattern.compile("^0x[0-9a-fA-F]{40}$");

    public record IssueRequest(@NotBlank String email, @NotNull Long courseId) { }

    private final BadgeService badgeService;

    public BadgeController(BadgeService badgeService) {
        this.badgeService = badgeService;
    }

    /** POST /api/badges/issue  { email, courseId } : le smart contract delivre le badge a l'utilisateur. */
    @PostMapping("/issue")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> issue(@Valid @RequestBody IssueRequest request) {
        Badge badge = badgeService.issue(request.email(), request.courseId());
        return Api.ok(
                "message", "Badge delivre par le smart contract",
                "badge", Views.badge(badge),
                "links", Views.txLinks(badge.getTxHash(), badge.getContractAddress()));
    }

    /** GET /api/badges/user/{email} : un eleve ne voit que les siens, l'ecole voit tout. */
    @GetMapping("/user/{email}")
    public Map<String, Object> listForUser(@PathVariable String email, @AuthenticationPrincipal AuthUser me) {
        if (me.role() != Role.ECOLE && !me.email().equalsIgnoreCase(email.trim())) {
            throw ApiException.forbidden("Vous ne pouvez consulter que vos propres badges");
        }
        return Api.ok("badges", badgeService.listForUser(email).stream().map(Views::badge).toList());
    }

    /**
     * GET /api/badges/verify/{walletAddress}/{courseId} : verification publique, lue dans le smart contract.
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
        BadgeService.Verification v = badgeService.verify(walletAddress, courseId);

        Map<String, Object> onChain = new LinkedHashMap<>();
        onChain.put("walletAddress", v.walletAddress());
        onChain.put("courseId", v.courseId());
        onChain.put("issuedAt", v.issuedAt());

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
