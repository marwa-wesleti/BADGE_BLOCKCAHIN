package com.esprit.badges.security;

import com.esprit.badges.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;

/** Fabrique et verifie les jetons JWT : un jeton prouve qui est connecte, sans session cote serveur. */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);
    private static final int MIN_SECRET_BYTES = 32;
    private static final long DEFAULT_TTL_MINUTES = 480;

    private final SecretKey key;
    private final long ttlMinutes;

    public JwtService(AuthProperties props) {
        byte[] secret = props.jwtSecret() == null ? new byte[0] : props.jwtSecret().trim().getBytes(StandardCharsets.UTF_8);
        if (secret.length < MIN_SECRET_BYTES) {
            log.warn("JWT_SECRET absent ou trop court (32 caracteres minimum) : un secret aleatoire est genere, "
                    + "les utilisateurs seront deconnectes a chaque redemarrage.");
            secret = new byte[48];
            new SecureRandom().nextBytes(secret);
        }
        this.key = Keys.hmacShaKeyFor(secret);
        this.ttlMinutes = props.jwtTtlMinutes() > 0 ? props.jwtTtlMinutes() : DEFAULT_TTL_MINUTES;
    }

    public long ttlMinutes() {
        return ttlMinutes;
    }

    public String issue(User user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getEmail())
                .claim("role", user.getRole().name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(Duration.ofMinutes(ttlMinutes))))
                .signWith(key)
                .compact();
    }

    /** Les informations du jeton si sa signature et sa date sont valides, sinon rien (jamais d'exception). */
    public Optional<Claims> parse(String token) {
        try {
            return Optional.of(Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload());
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
