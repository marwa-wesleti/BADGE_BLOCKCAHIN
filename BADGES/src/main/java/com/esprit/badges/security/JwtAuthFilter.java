package com.esprit.badges.security;

import com.esprit.badges.model.User;
import com.esprit.badges.repository.UserRepository;
import com.esprit.badges.web.Api;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Lit l'en-tete "Authorization: Bearer <jeton>". Si le jeton est valide, l'utilisateur est reconnu pour cette requete.
 * Le profil est relu dans la base a chaque fois : un compte supprime ou change de role est pris en compte immediatement.
 * Un jeton absent ou invalide ne bloque rien ici : ce sont les regles de SecurityConfig qui refusent (401).
 *
 * Mot de passe temporaire : tant que l'eleve n'a pas choisi le sien, une seule chose est permise (changer son mot de passe,
 * plus lire son profil et la configuration pour que la page sache quoi afficher). Tout le reste repond 403, meme avec un
 * jeton obtenu avant la reinitialisation : la regle est appliquee ici, par le serveur, pas seulement par l'interface.
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String PREFIX = "Bearer ";
    /** Les seules routes ouvertes a un compte dont le mot de passe doit etre change. */
    private static final Set<String> ALLOWED_WHILE_TEMPORARY = Set.of("/api/auth/change-password", "/api/me", "/api/config");

    private final JwtService jwt;
    private final UserRepository users;
    private final ObjectMapper json;

    public JwtAuthFilter(JwtService jwt, UserRepository users, ObjectMapper json) {
        this.jwt = jwt;
        this.users = users;
        this.json = json;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(PREFIX)) {
            Optional<User> user = jwt.parse(header.substring(PREFIX.length()).trim())
                    .flatMap(claims -> users.findByEmail(claims.getSubject()));
            if (user.isPresent()) {
                if (user.get().isMustChangePassword() && isApi(request) && !ALLOWED_WHILE_TEMPORARY.contains(request.getRequestURI())) {
                    refuse(response);
                    return;
                }
                AuthUser principal = new AuthUser(user.get().getId(), user.get().getEmail(), user.get().getRole());
                var authority = new SimpleGrantedAuthority("ROLE_" + user.get().getRole().name());
                SecurityContextHolder.getContext()
                        .setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, List.of(authority)));
            }
        }
        chain.doFilter(request, response);
    }

    private static boolean isApi(HttpServletRequest request) {
        return request.getRequestURI().startsWith("/api/");
    }

    private void refuse(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        Map<String, Object> body = Api.error("Vous devez d'abord choisir un nouveau mot de passe");
        body.put("passwordChangeRequired", true); // l'interface s'en sert pour renvoyer vers la page de changement
        json.writeValue(response.getWriter(), body);
    }
}
