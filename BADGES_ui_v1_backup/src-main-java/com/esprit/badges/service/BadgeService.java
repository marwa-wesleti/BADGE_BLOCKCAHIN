package com.esprit.badges.service;

import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.blockchain.EthereumService;
import com.esprit.badges.model.Badge;
import com.esprit.badges.model.Course;
import com.esprit.badges.model.User;
import com.esprit.badges.repository.BadgeRepository;
import com.esprit.badges.repository.UserRepository;
import com.esprit.badges.web.ApiException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
public class BadgeService {

    private static final int MAX_TITLE_LENGTH = 100;

    /**
     * Resultat de la verification. issuedAt vient de la BLOCKCHAIN (c'est elle qui fait foi) ;
     * badge vient de la base (pour retrouver le nom et le cours) et peut etre vide.
     */
    public record Verification(boolean valid, String walletAddress, long courseId, Instant issuedAt, Badge badge) { }

    private final BadgeRepository badges;
    private final UserRepository users;
    private final UserService userService;
    private final CourseService courseService;
    private final EthereumService ethereum;
    private final EthereumProperties props;

    public BadgeService(BadgeRepository badges, UserRepository users, UserService userService,
                        CourseService courseService, EthereumService ethereum, EthereumProperties props) {
        this.badges = badges;
        this.users = users;
        this.userService = userService;
        this.courseService = courseService;
        this.ethereum = ethereum;
        this.props = props;
    }

    /**
     * 1) verifie que le cours est termine (base de donnees)
     * 2) demande au SMART CONTRACT de delivrer le badge : c'est lui qui applique les regles sur la blockchain.
     * Pas de @Transactional : on ne garde pas une transaction de base ouverte pendant un appel reseau.
     */
    public Badge issue(String email, Long courseId) {
        User user = userService.getByEmail(email);
        Course course = courseService.get(courseId);

        if (badges.findByUserIdAndCourseId(user.getId(), course.getId()).isPresent()) {
            throw ApiException.conflict("Badge deja delivre pour ce cours");
        }
        if (!user.hasCompleted(course)) {
            throw ApiException.badRequest("Cours non termine : pas de badge");
        }
        // Lecture gratuite : evite de payer une transaction que le contrat refuserait de toute facon
        if (ethereum.getBadgeIssuedAt(user.getWalletAddress(), course.getId()).isPresent()) {
            throw ApiException.conflict("Ce badge existe deja sur la blockchain pour ce portefeuille et ce cours");
        }

        String title = course.getTitle().length() > MAX_TITLE_LENGTH
                ? course.getTitle().substring(0, MAX_TITLE_LENGTH) : course.getTitle();
        EthereumService.TxResult tx = ethereum.issueBadge(user.getWalletAddress(), course.getId(), title);

        return badges.save(new Badge(user, course, props.contractAddress(),
                tx.transactionHash(), tx.blockNumber(), tx.blockTime()));
    }

    public List<Badge> listForUser(String email) {
        return badges.findByUserId(userService.getByEmail(email).getId());
    }

    /**
     * Verification PUBLIQUE : on lit le smart contract. Il suffit de connaitre l'adresse du portefeuille de l'eleve
     * (une information publique) et le numero du cours ; aucun mot de passe, aucune confiance dans notre base.
     */
    public Verification verify(String walletAddress, long courseId) {
        String address = walletAddress.toLowerCase(Locale.ROOT);
        Optional<Instant> issuedAt = ethereum.getBadgeIssuedAt(address, courseId);

        Badge badge = users.findByWalletAddress(address)
                .flatMap(u -> badges.findByUserIdAndCourseId(u.getId(), courseId))
                .orElse(null);
        return new Verification(issuedAt.isPresent(), address, courseId, issuedAt.orElse(null), badge);
    }
}
