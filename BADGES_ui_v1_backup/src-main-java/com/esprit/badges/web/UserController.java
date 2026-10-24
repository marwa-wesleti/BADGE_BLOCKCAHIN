package com.esprit.badges.web;

import com.esprit.badges.model.User;
import com.esprit.badges.service.BadgeService;
import com.esprit.badges.service.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    public record RegisterRequest(@NotBlank String username, @NotBlank String email) { }

    private final UserService userService;
    private final BadgeService badgeService;

    public UserController(UserService userService, BadgeService badgeService) {
        this.userService = userService;
        this.badgeService = badgeService;
    }

    /** POST /api/users/register  { username, email } : cree l'utilisateur et son portefeuille Ethereum. */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> register(@Valid @RequestBody RegisterRequest request) {
        UserService.Registration registration = userService.register(request.username(), request.email());
        return Api.ok(
                "user", Views.user(registration.user()),
                // Montree une seule fois : le serveur ne la conserve pas
                "privateKey", registration.privateKey(),
                "warning", "Sauvegardez privateKey maintenant : elle ne sera plus jamais affichee.");
    }

    /** GET /api/users/{email} : profil, cours termines, badges. */
    @GetMapping("/{email}")
    public Map<String, Object> profile(@PathVariable String email) {
        User user = userService.getByEmail(email);
        return Api.ok(
                "user", Views.userWithCourses(user),
                "badges", badgeService.listForUser(email).stream().map(Views::badge).toList());
    }
}
