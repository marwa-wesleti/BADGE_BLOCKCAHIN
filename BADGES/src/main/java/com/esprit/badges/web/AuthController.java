package com.esprit.badges.web;

import com.esprit.badges.security.AuthUser;
import com.esprit.badges.security.JwtService;
import com.esprit.badges.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 40) String username,
            @NotBlank @Email @Size(max = 120) String email,
            @NotBlank @Size(max = 200) String password) { }

    public record LoginRequest(@NotBlank String email, @NotBlank String password) { }

    public record ChangePasswordRequest(@NotBlank @Size(max = 200) String currentPassword, @NotBlank @Size(max = 200) String newPassword) { }

    private final AuthService auth;
    private final JwtService jwt;

    public AuthController(AuthService auth, JwtService jwt) {
        this.auth = auth;
        this.jwt = jwt;
    }

    /** POST /api/auth/register : cree un compte ELEVE et son portefeuille, et le connecte. Il n'existe pas d'inscription ecole. */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> register(@Valid @RequestBody RegisterRequest request) {
        AuthService.Registration r = auth.register(request.username(), request.email(), request.password());
        return Api.ok(
                "user", Views.user(r.user()),
                "token", r.token(),
                "expiresInMinutes", jwt.ttlMinutes(),
                // Montree une seule fois : le serveur ne la conserve pas
                "privateKey", r.privateKey(),
                "warning", "Sauvegardez privateKey maintenant : elle ne sera plus jamais affichee.");
    }

    /** POST /api/auth/login : e-mail et mot de passe, renvoie un jeton a envoyer dans l'en-tete Authorization. */
    @PostMapping("/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        AuthService.Session session = auth.login(request.email(), request.password(), http.getRemoteAddr());
        return Api.ok(
                "user", Views.user(session.user()),
                "token", session.token(),
                "expiresInMinutes", jwt.ttlMinutes());
    }

    /**
     * POST /api/auth/change-password : l'eleve choisit son propre mot de passe. Obligatoire apres une reinitialisation par
     * l'ecole : tant qu'il n'est pas fait, le serveur refuse tout le reste (voir JwtAuthFilter).
     */
    @PostMapping("/change-password")
    public Map<String, Object> changePassword(@Valid @RequestBody ChangePasswordRequest request,
                                              @AuthenticationPrincipal AuthUser me, HttpServletRequest http) {
        var user = auth.changePassword(me.email(), request.currentPassword(), request.newPassword(), http.getRemoteAddr());
        return Api.ok("message", "Mot de passe change", "user", Views.user(user));
    }
}
