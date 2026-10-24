package com.esprit.badges.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

/**
 * Trace en base d'un badge NFT delivre. La VERITE est dans le smart contract BadgeNFT (ownerOf, tokenURI) ;
 * cette ligne ne sert qu'a retrouver l'utilisateur, le cours, le numero du jeton et la transaction.
 * Un seul badge NFT par utilisateur et par cours.
 */
@Entity
@Table(name = "nft_badges", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "course_id"}))
public class NftBadge {

    @Id
    private UUID id = UUID.randomUUID();

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @ManyToOne(optional = false)
    @JoinColumn(name = "course_id")
    private Course course;

    @Column(nullable = false)
    private String contractAddress;   // smart contract NFT qui a cree le jeton

    @Column(nullable = false)
    private Long tokenId;             // numero du jeton dans ce contrat

    @Column(nullable = false)
    private String txHash;            // transaction de creation (visible sur Etherscan)

    @Column(nullable = false)
    private Long blockNumber;

    @Column(nullable = false)
    private String blockTime;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected NftBadge() { }

    public NftBadge(User user, Course course, String contractAddress, long tokenId,
                    String txHash, long blockNumber, String blockTime) {
        this.user = user;
        this.course = course;
        this.contractAddress = contractAddress;
        this.tokenId = tokenId;
        this.txHash = txHash;
        this.blockNumber = blockNumber;
        this.blockTime = blockTime;
    }

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public Course getCourse() { return course; }
    public String getContractAddress() { return contractAddress; }
    public Long getTokenId() { return tokenId; }
    public String getTxHash() { return txHash; }
    public Long getBlockNumber() { return blockNumber; }
    public String getBlockTime() { return blockTime; }
    public Instant getCreatedAt() { return createdAt; }
}
