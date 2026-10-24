package com.esprit.badges.service;

import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.blockchain.EthereumService;
import com.esprit.badges.model.Course;
import com.esprit.badges.model.NftBadge;
import com.esprit.badges.model.User;
import com.esprit.badges.repository.NftBadgeRepository;
import com.esprit.badges.repository.UserRepository;
import com.esprit.badges.web.ApiException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

/** Badges sous forme de NFT : meme parcours que BadgeService, mais le contrat cree un JETON que l'eleve possede. */
@Service
public class NftBadgeService {

    private static final int MAX_TITLE_LENGTH = 100;

    /**
     * Resultat de la verification. onChain vient de la BLOCKCHAIN (c'est elle qui fait foi) ;
     * badge vient de la base (nom de l'eleve, cours) et peut etre vide.
     */
    public record Verification(boolean valid, String walletAddress, long courseId,
                               EthereumService.NftBadgeOnChain onChain, NftBadge badge) { }

    private final NftBadgeRepository nftBadges;
    private final UserRepository users;
    private final UserService userService;
    private final CourseService courseService;
    private final EthereumService ethereum;
    private final EthereumProperties props;

    public NftBadgeService(NftBadgeRepository nftBadges, UserRepository users, UserService userService,
                           CourseService courseService, EthereumService ethereum, EthereumProperties props) {
        this.nftBadges = nftBadges;
        this.users = users;
        this.userService = userService;
        this.courseService = courseService;
        this.ethereum = ethereum;
        this.props = props;
    }

    /**
     * 1) verifie en base : pas de doublon, cours termine
     * 2) lit le contrat (gratuit) : le jeton n'existe-t-il pas deja ?
     * 3) demande au SMART CONTRACT de creer le jeton : c'est lui qui applique les regles sur la blockchain.
     * Pas de @Transactional : on ne garde pas une transaction de base ouverte pendant un appel reseau.
     */
    public NftBadge issue(String email, Long courseId) {
        User user = userService.getByEmail(email);
        Course course = courseService.get(courseId);

        if (nftBadges.findByUserIdAndCourseId(user.getId(), course.getId()).isPresent()) {
            throw ApiException.conflict("Badge NFT deja delivre pour ce cours");
        }
        if (!user.hasCompleted(course)) {
            throw ApiException.badRequest("Cours non termine : pas de badge");
        }
        // Lecture gratuite : evite de payer une transaction que le contrat refuserait de toute facon
        if (ethereum.getNftBadge(user.getWalletAddress(), course.getId()).isPresent()) {
            throw ApiException.conflict("Ce badge NFT existe deja sur la blockchain pour ce portefeuille et ce cours");
        }

        String title = course.getTitle().length() > MAX_TITLE_LENGTH
                ? course.getTitle().substring(0, MAX_TITLE_LENGTH) : course.getTitle();
        EthereumService.NftMint mint = ethereum.issueNftBadge(user.getWalletAddress(), course.getId(), title);

        return nftBadges.save(new NftBadge(user, course, props.nftContractAddress(), mint.tokenId(),
                mint.tx().transactionHash(), mint.tx().blockNumber(), mint.tx().blockTime()));
    }

    public List<NftBadge> listForUser(String email) {
        return nftBadges.findByUserId(userService.getByEmail(email).getId());
    }

    /**
     * Verification PUBLIQUE : on lit le smart contract. Il suffit de connaitre l'adresse du portefeuille de l'eleve
     * et le numero du cours. La reponse donne aussi le proprietaire actuel du jeton, lu dans le contrat.
     */
    public Verification verify(String walletAddress, long courseId) {
        String address = walletAddress.toLowerCase(Locale.ROOT);
        Optional<EthereumService.NftBadgeOnChain> onChain = ethereum.getNftBadge(address, courseId);

        NftBadge badge = users.findByWalletAddress(address)
                .flatMap(u -> nftBadges.findByUserIdAndCourseId(u.getId(), courseId))
                .orElse(null);
        return new Verification(onChain.isPresent(), address, courseId, onChain.orElse(null), badge);
    }
}
