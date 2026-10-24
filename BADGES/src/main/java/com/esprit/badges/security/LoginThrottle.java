package com.esprit.badges.security;

import com.esprit.badges.web.ApiException;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;

/**
 * Freine les essais de mots de passe : apres 5 echecs en 10 minutes pour un meme e-mail et une meme adresse,
 * la connexion est refusee (429) jusqu'a ce que les plus anciens echecs sortent de la fenetre.
 * Garde en memoire : redemarrer le serveur remet tout a zero. Suffisant pour ce projet.
 */
@Component
public class LoginThrottle {

    static final int MAX_FAILURES = 5;
    static final Duration WINDOW = Duration.ofMinutes(10);

    private final Map<String, Deque<Instant>> failures = new HashMap<>();

    /** Leve une erreur 429 si trop d'echecs recents pour cette cle. */
    public synchronized void check(String key) {
        prune(key);
        Deque<Instant> recent = failures.get(key);
        if (recent != null && recent.size() >= MAX_FAILURES) {
            throw ApiException.tooManyRequests("Trop de tentatives : reessayez dans quelques minutes");
        }
    }

    public synchronized void recordFailure(String key) {
        prune(key);
        failures.computeIfAbsent(key, k -> new ArrayDeque<>()).addLast(Instant.now());
    }

    public synchronized void reset(String key) {
        failures.remove(key);
    }

    /** Oublie les echecs sortis de la fenetre, et la cle elle-meme quand il n'en reste plus. */
    private void prune(String key) {
        Deque<Instant> queue = failures.get(key);
        if (queue == null) {
            return;
        }
        Instant limit = Instant.now().minus(WINDOW);
        while (!queue.isEmpty() && queue.peekFirst().isBefore(limit)) {
            queue.removeFirst();
        }
        if (queue.isEmpty()) {
            failures.remove(key);
        }
    }
}
