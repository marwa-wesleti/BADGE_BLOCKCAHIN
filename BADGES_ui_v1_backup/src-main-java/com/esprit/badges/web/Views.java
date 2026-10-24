package com.esprit.badges.web;

import com.esprit.badges.model.Badge;
import com.esprit.badges.model.Course;
import com.esprit.badges.model.NftBadge;
import com.esprit.badges.model.User;

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
