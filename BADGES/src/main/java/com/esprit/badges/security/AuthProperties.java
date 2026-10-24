package com.esprit.badges.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Reglages de l'authentification, lus dans application.properties (donc dans le .env).
 * jwtSecret      : secret qui signe les jetons (32 caracteres minimum). Vide = un secret aleatoire est genere a chaque
 *                  demarrage : tout le monde est alors deconnecte au redemarrage.
 * jwtTtlMinutes  : duree de vie d'un jeton.
 * ecoleEmail, ecolePassword, ecoleUsername : le compte de l'ecole, cree (ou mis a jour) au demarrage.
 */
@ConfigurationProperties(prefix = "auth")
public record AuthProperties(
        String jwtSecret,
        long jwtTtlMinutes,
        String ecoleEmail,
        String ecolePassword,
        String ecoleUsername) {
}
