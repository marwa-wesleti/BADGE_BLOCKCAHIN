package com.esprit.badges.web;

import com.esprit.badges.model.User;
import com.esprit.badges.security.AuthUser;
import com.esprit.badges.service.BadgeService;
import com.esprit.badges.service.NftBadgeService;
import com.esprit.badges.service.UserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** "Mon espace" : le profil de la personne connectee, ses cours termines et ses badges. */
@RestController
@RequestMapping("/api/me")
public class MeController {

    private final UserService userService;
    private final BadgeService badgeService;
    private final NftBadgeService nftBadgeService;

    public MeController(UserService userService, BadgeService badgeService, NftBadgeService nftBadgeService) {
        this.userService = userService;
        this.badgeService = badgeService;
        this.nftBadgeService = nftBadgeService;
    }

    /** GET /api/me */
    @GetMapping
    public Map<String, Object> me(@AuthenticationPrincipal AuthUser me) {
        User user = userService.getByEmail(me.email());
        return Api.ok(
                "user", Views.userWithCourses(user),
                "badges", badgeService.listForUser(me.email()).stream().map(Views::badge).toList(),
                "nftBadges", nftBadgeService.listForUser(me.email()).stream().map(Views::nftBadge).toList());
    }
}
