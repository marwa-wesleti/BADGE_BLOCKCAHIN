package com.esprit.badges.service;

import com.esprit.badges.blockchain.EthereumService;
import com.esprit.badges.model.User;
import com.esprit.badges.repository.UserRepository;
import com.esprit.badges.web.ApiException;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class UserService {

    /** La cle privee n'existe que dans cet objet de reponse : elle n'est jamais enregistree. */
    public record Registration(User user, String privateKey) { }

    private final UserRepository users;
    private final EthereumService ethereum;

    public UserService(UserRepository users, EthereumService ethereum) {
        this.users = users;
        this.ethereum = ethereum;
    }

    /** Cree l'utilisateur ET son portefeuille Ethereum (paire de cles publique/privee, calculee localement). */
    public Registration register(String username, String email) {
        String normalizedEmail = normalize(email);
        if (users.existsByUsernameOrEmail(username, normalizedEmail)) {
            throw ApiException.conflict("username ou email deja utilise");
        }
        EthereumService.NewWallet wallet = ethereum.createWallet();
        User user = users.save(new User(username, normalizedEmail, wallet.address().toLowerCase(Locale.ROOT)));
        return new Registration(user, wallet.privateKey());
    }

    public User getByEmail(String email) {
        return users.findByEmail(normalize(email))
                .orElseThrow(() -> ApiException.notFound("Utilisateur introuvable"));
    }

    public static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
