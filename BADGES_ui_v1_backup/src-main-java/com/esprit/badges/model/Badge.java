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
 * Trace en base d'un badge delivre. La VERITE est dans le smart contract ; cette ligne ne sert qu'a
 * retrouver facilement l'utilisateur, le cours et la transaction. Un seul badge par utilisateur et par cours.
 */
@Entity
@Table(name = "badges", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "course_id"}))
public class Badge {

    @Id
    private UUID id = UUID.randomUUID();

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @ManyToOne(optional = false)
    @JoinColumn(name = "course_id")
    private Course course;

    @Column(nullable = false)
    private String contractAddress;   // smart contract qui a delivre le badge

    @Column(nullable = false)
    private String txHash;            // transaction de delivrance (visible sur Etherscan)

    @Column(nullable = false)
    private Long blockNumber;         // bloc qui contient la transaction

    @Column(nullable = false)
    private String blockTime;         // date de ce bloc (horodatage donne par le reseau)

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected Badge() { }

    public Badge(User user, Course course, String contractAddress, String txHash, long blockNumber, String blockTime) {
        this.user = user;
        this.course = course;
        this.contractAddress = contractAddress;
        this.txHash = txHash;
        this.blockNumber = blockNumber;
        this.blockTime = blockTime;
    }

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public Course getCourse() { return course; }
    public String getContractAddress() { return contractAddress; }
    public String getTxHash() { return txHash; }
    public Long getBlockNumber() { return blockNumber; }
    public String getBlockTime() { return blockTime; }
    public Instant getCreatedAt() { return createdAt; }
}
