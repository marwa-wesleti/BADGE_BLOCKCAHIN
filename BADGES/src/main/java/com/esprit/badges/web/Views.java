package com.esprit.badges.web;

import com.esprit.badges.model.Badge;
import com.esprit.badges.model.Course;
import com.esprit.badges.model.IssuedDocument;
import com.esprit.badges.model.NftBadge;
import com.esprit.badges.model.User;
import com.esprit.badges.service.SchoolService;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Transforme les entites en JSON : on choisit exactement ce qui est montre (jamais de donnee interne). */
final class Views {

    private static final String ETHERSCAN = "https://sepolia.etherscan.io";

    private Views() { }

    static Map<String, Object> course(Course c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("title", c.getTitle());
        m.put("description", c.getDescription());
        m.put("difficulty", c.getDifficulty());
        return m;
    }

    static Map<String, Object> user(User u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("username", u.getUsername());
        m.put("email", u.getEmail());
        m.put("walletAddress", u.getWalletAddress());
        m.put("role", u.getRole());
        m.put("mustChangePassword", u.isMustChangePassword());
        return m;
    }

    /** Un eleve vu par l'ecole : son profil, et pour chaque cours : termine, badge du registre, badge NFT. */
    static Map<String, Object> student(SchoolService.StudentRow row) {
        Map<String, Object> m = user(row.user());
        m.put("hasPassword", row.user().getPasswordHash() != null);
        m.put("completedCourseIds", row.completedCourseIds());
        m.put("badgeCourseIds", row.badgeCourseIds());
        m.put("nftCourseIds", row.nftCourseIds());
        return m;
    }

    static Map<String, Object> userWithCourses(User u) {
        Map<String, Object> m = user(u);
        List<Map<String, Object>> courses = u.getCompletedCourses().stream().map(Views::course).toList();
        m.put("completedCourses", courses);
        return m;
    }

    static Map<String, Object> badge(Badge b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", b.getId());
        m.put("courseId", b.getCourse().getId());
        m.put("course", b.getCourse().getTitle());
        m.put("owner", b.getUser().getWalletAddress());
        m.put("contractAddress", b.getContractAddress());
        m.put("txHash", b.getTxHash());
        m.put("blockNumber", b.getBlockNumber());
        m.put("blockTime", b.getBlockTime());
        return m;
    }

    static Map<String, Object> nftBadge(NftBadge b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", b.getId());
        m.put("courseId", b.getCourse().getId());
        m.put("course", b.getCourse().getTitle());
        m.put("owner", b.getUser().getWalletAddress());
        m.put("contractAddress", b.getContractAddress());
        m.put("tokenId", b.getTokenId());
        m.put("txHash", b.getTxHash());
        m.put("blockNumber", b.getBlockNumber());
        m.put("blockTime", b.getBlockTime());
        return m;
    }

    /** Un document emis : jamais son contenu (le serveur ne l'a pas), seulement son titre, son empreinte et sa preuve. */
    static Map<String, Object> document(IssuedDocument d) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", d.getId());
        m.put("title", d.getTitle());
        m.put("type", d.getType());
        m.put("hash", d.getHash());
        m.put("student", d.getStudent() == null ? null : user(d.getStudent()));
        m.put("contractAddress", d.getContractAddress());
        m.put("txHash", d.getTxHash());
        m.put("blockNumber", d.getBlockNumber());
        m.put("blockTime", d.getBlockTime());
        m.put("createdAt", d.getCreatedAt());
        return m;
    }

    /** Liens Etherscan d'un badge NFT : la transaction, le contrat, et la page du jeton lui-meme. */
    static Map<String, Object> nftLinks(String txHash, String contractAddress, long tokenId) {
        return Map.of(
                "transaction", ETHERSCAN + "/tx/" + txHash,
                "contract", ETHERSCAN + "/address/" + contractAddress,
                "token", ETHERSCAN + "/nft/" + contractAddress + "/" + tokenId);
    }

    static Map<String, Object> txLinks(String txHash, String contractAddress) {
        return Map.of(
                "transaction", ETHERSCAN + "/tx/" + txHash,
                "contract", ETHERSCAN + "/address/" + contractAddress);
    }

    static Map<String, Object> contractLink(String contractAddress) {
        return Map.of("contract", ETHERSCAN + "/address/" + contractAddress);
    }
}
