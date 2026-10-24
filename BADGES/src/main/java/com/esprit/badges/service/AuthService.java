package com.esprit.badges.service;

import com.esprit.badges.blockchain.EthereumService;
import com.esprit.badges.model.Role;
import com.esprit.badges.model.User;
import com.esprit.badges.repository.UserRepository;
import com.esprit.badges.security.JwtService;
import com.esprit.badges.security.LoginThrottle;
import com.esprit.badges.web.ApiException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;

/** Inscription, connexion et reinitialisation de mot de passe. */
@Service
public class AuthService {

    /** BCrypt ne lit que les 72 premiers octets d'un mot de passe : on refuse plus long plutot que de tronquer. */
    private static final int MAX_PASSWORD_BYTES = 72;
    private static final int MIN_PASSWORD_LENGTH = 8;
    // Sans 0, O, 1, l, I : un mot de passe temporaire se recopie a la main
    private static final String TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    /** La cle privee n'existe que dans cet objet : elle n'est jamais enregistree. */
    public record Registration(User user, String privateKey, String token) { }

    public record Session(User user, String token) { }

    /** Un compte cree par l'ecole : le mot de passe temporaire et la cle privee n'existent que dans cet objet, jamais enregistres en clair. */
    public record CreatedStudent(User user, String temporaryPassword, String privateKey) { }

    private final UserRepository users;
    private final EthereumService ethereum;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final LoginThrottle throttle;
    private final SecureRandom random = new SecureRandom();
    /** Hash d'un mot de passe bidon : compare quand l'e-mail n'existe pas, pour que la reponse ait la meme duree. */
    private final String dummyHash;

    public AuthService(UserRepository users, EthereumService ethereum, PasswordEncoder encoder,
                       JwtService jwt, LoginThrottle throttle) {
        this.users = users;
        this.ethereum = ethereum;
        this.encoder = encoder;
        this.jwt = jwt;
        this.throttle = throttle;
        this.dummyHash = encoder.encode("mot-de-passe-bidon-pour-egaliser-les-durees");
    }

    /** Cree un ELEVE avec son portefeuille Ethereum (paire de cles calculee localement) et le connecte. */
    public Registration register(String username, String email, String password) {
        validatePassword(password);
        String name = username.trim();
        String normalized = UserService.normalize(email);
        if (users.existsByUsernameOrEmail(name, normalized)) {
            throw ApiException.conflict("Ce pseudo ou cet e-mail est deja utilise");
        }
        EthereumService.NewWallet wallet = ethereum.createWallet();
        User user = users.save(new User(name, normalized, wallet.address().toLowerCase(Locale.ROOT),
                Role.ELEVE, encoder.encode(password)));
        return new Registration(user, wallet.privateKey(), jwt.issue(user));
    }

    /** Message volontairement identique pour un e-mail inconnu et un mauvais mot de passe : on ne revele pas qui a un compte. */
    public Session login(String email, String password, String clientAddress) {
        String normalized = UserService.normalize(email);
        String throttleKey = normalized + "|" + clientAddress;
        throttle.check(throttleKey);

        User user = users.findByEmail(normalized).orElse(null);
        boolean hasPassword = user != null && user.getPasswordHash() != null;
        boolean matches = encoder.matches(password, hasPassword ? user.getPasswordHash() : dummyHash);
        if (!hasPassword || !matches) {
            throttle.recordFailure(throttleKey);
            throw ApiException.unauthorized("E-mail ou mot de passe incorrect");
        }
        throttle.reset(throttleKey);
        return new Session(user, jwt.issue(user));
    }

    /**
     * L'ecole cree le compte d'un eleve (au lieu d'attendre qu'il s'inscrive) : portefeuille Ethereum calcule localement,
     * mot de passe temporaire genere, a changer des la premiere connexion. Aucune transaction : cela ne coute pas d'ETH.
     * La cle privee est renvoyee UNE fois, a l'ecole, qui doit la remettre a l'eleve : le serveur ne la conserve pas.
     */
    public CreatedStudent createStudent(String username, String email) {
        String name = username.trim();
        String normalized = UserService.normalize(email);
        if (users.existsByUsernameOrEmail(name, normalized)) {
            throw ApiException.conflict("Ce pseudo ou cet e-mail est deja utilise");
        }
        EthereumService.NewWallet wallet = ethereum.createWallet();
        String temporary = generateTemporaryPassword();
        User user = new User(name, normalized, wallet.address().toLowerCase(Locale.ROOT), Role.ELEVE, encoder.encode(temporary));
        user.setMustChangePassword(true);
        return new CreatedStudent(users.save(user), temporary, wallet.privateKey());
    }

    /**
     * L'ecole attribue un mot de passe temporaire a un eleve (ancien compte sans mot de passe, ou oubli).
     * Il est renvoye UNE fois et n'est jamais enregistre en clair.
     */
    public String resetStudentPassword(Long studentId) {
        User student = users.findById(studentId).orElseThrow(() -> ApiException.notFound("Eleve introuvable"));
        if (student.getRole() != Role.ELEVE) {
            throw ApiException.badRequest("Seul le mot de passe d'un eleve peut etre reinitialise ici");
        }
        String temporary = generateTemporaryPassword();
        student.setPasswordHash(encoder.encode(temporary));
        student.setMustChangePassword(true); // l'eleve devra choisir le sien des sa premiere connexion
        users.save(student);
        return temporary;
    }

    private String generateTemporaryPassword() {
        StringBuilder temporary = new StringBuilder();
        for (int i = 0; i < 12; i++) {
            temporary.append(TEMP_ALPHABET.charAt(random.nextInt(TEMP_ALPHABET.length())));
        }
        return temporary.toString();
    }

    /**
     * L'eleve remplace son mot de passe (le temporaire donne par l'ecole, ou l'actuel s'il le souhaite).
     * L'ancien mot de passe est redemande : un jeton vole ne suffit pas a prendre le compte. Les essais ratés sont freines
     * comme a la connexion. Le mot de passe de l'ecole vient du .env (il y est reapplique a chaque demarrage) : pas ici.
     */
    public User changePassword(String email, String currentPassword, String newPassword, String clientAddress) {
        User user = users.findByEmail(UserService.normalize(email)).orElseThrow(() -> ApiException.unauthorized("Connexion requise"));
        if (user.getRole() != Role.ELEVE) {
            throw ApiException.forbidden("Le mot de passe de l'ecole se change dans le fichier .env du serveur");
        }
        String throttleKey = "changement|" + user.getEmail() + "|" + clientAddress;
        throttle.check(throttleKey);
        if (user.getPasswordHash() == null || !encoder.matches(currentPassword, user.getPasswordHash())) {
            throttle.recordFailure(throttleKey);
            throw ApiException.unauthorized("Mot de passe actuel incorrect");
        }
        validatePassword(newPassword);
        if (newPassword.equals(currentPassword)) {
            throw ApiException.badRequest("Le nouveau mot de passe doit etre different de l'actuel");
        }
        throttle.reset(throttleKey);
        user.setPasswordHash(encoder.encode(newPassword));
        user.setMustChangePassword(false);
        return users.save(user);
    }

    private static void validatePassword(String password) {
        if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
            throw ApiException.badRequest("Mot de passe trop court : " + MIN_PASSWORD_LENGTH + " caracteres minimum");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw ApiException.badRequest("Mot de passe trop long : " + MAX_PASSWORD_BYTES + " octets maximum");
        }
    }
}
