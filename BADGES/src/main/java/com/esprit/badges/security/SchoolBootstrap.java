package com.esprit.badges.security;

import com.esprit.badges.blockchain.EthereumService;
import com.esprit.badges.model.Role;
import com.esprit.badges.model.User;
import com.esprit.badges.repository.UserRepository;
import com.esprit.badges.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * Au demarrage, cree (ou met a jour) le compte de l'ecole a partir de ECOLE_EMAIL et ECOLE_PASSWORD dans le .env.
 * Son adresse est celle du portefeuille de l'ecole : c'est elle qui signe et qui est "owner" des contrats.
 * Changer ECOLE_PASSWORD dans le .env puis redemarrer suffit a changer le mot de passe de l'ecole.
 */
@Component
public class SchoolBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SchoolBootstrap.class);

    private final AuthProperties props;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final EthereumService ethereum;

    public SchoolBootstrap(AuthProperties props, UserRepository users, PasswordEncoder encoder, EthereumService ethereum) {
        this.props = props;
        this.users = users;
        this.encoder = encoder;
        this.ethereum = ethereum;
    }

    @Override
    public void run(ApplicationArguments args) {
        String email = blankToNull(props.ecoleEmail());
        String password = blankToNull(props.ecolePassword());
        if (email == null || password == null) {
            log.warn("ECOLE_EMAIL ou ECOLE_PASSWORD absent du .env : aucun compte ecole n'a ete cree, "
                    + "personne ne pourra delivrer de badge depuis l'interface.");
            return;
        }
        if (password.length() < 8) {
            log.warn("ECOLE_PASSWORD trop court (8 caracteres minimum) : le compte ecole n'a pas ete cree.");
            return;
        }

        String wallet;
        try {
            wallet = ethereum.schoolAddress().toLowerCase(Locale.ROOT);
        } catch (RuntimeException e) {
            log.warn("Compte ecole non cree : la cle ETH_PRIVATE_KEY est absente ou invalide ({}).", e.getMessage());
            return;
        }

        String normalized = UserService.normalize(email);
        User school = users.findByEmail(normalized).orElse(null);
        if (school == null) {
            String username = blankToNull(props.ecoleUsername()) == null ? "ecole" : props.ecoleUsername().trim();
            if (users.existsByUsername(username)) {
                username = username + "-admin";
            }
            users.save(new User(username, normalized, wallet, Role.ECOLE, encoder.encode(password)));
            log.info("Compte ecole cree : {}", normalized);
            return;
        }
        boolean changed = false;
        if (school.getRole() != Role.ECOLE) {
            school.setRole(Role.ECOLE);
            changed = true;
        }
        if (school.getPasswordHash() == null || !encoder.matches(password, school.getPasswordHash())) {
            school.setPasswordHash(encoder.encode(password));
            changed = true;
        }
        if (changed) {
            users.save(school);
            log.info("Compte ecole mis a jour : {}", normalized);
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
