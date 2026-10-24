package com.esprit.badges.security;

import com.esprit.badges.repository.UserRepository;
import com.esprit.badges.web.Api;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Qui a le droit de faire quoi.
 *  - public : s'inscrire, se connecter, la configuration, et TOUTES les verifications (lecture seule, comme la blockchain) ;
 *  - ECOLE  : creer un cours, le valider pour un eleve, delivrer un badge, graver une empreinte, voir les eleves ;
 *  - tout compte connecte : son profil, ses documents et leur certificat (le service verifie que le document est a lui).
 * Pas de session ni de cookie : le jeton est envoye dans l'en-tete a chaque requete, donc pas de faille CSRF.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtService jwt, UserRepository users, ObjectMapper json) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/config").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/badges/verify/**", "/api/nft-badges/verify/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/proofs/verify", "/api/proofs/hash/verify").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/courses", "/api/courses/*/complete",
                                "/api/badges/issue", "/api/nft-badges/issue", "/api/proofs", "/api/proofs/hash", "/api/documents").hasRole("ECOLE")
                        .requestMatchers("/api/school/**").hasRole("ECOLE")
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll()) // la page web elle-meme (fichiers statiques) reste accessible a tous
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) -> write(json, res, 401, "Connexion requise"))
                        .accessDeniedHandler((req, res, ex) -> write(json, res, 403, "Action reservee a l'ecole")))
                .addFilterBefore(new JwtAuthFilter(jwt, users, json), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private static void write(ObjectMapper json, HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        json.writeValue(response.getWriter(), Api.error(message));
    }
}
