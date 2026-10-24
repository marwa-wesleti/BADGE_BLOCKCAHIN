package com.esprit.badges.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Trace en base d'un document dont l'empreinte a ete gravee dans le smart contract. Le document lui-meme n'est JAMAIS
 * stocke : on ne garde que son titre, son type, son destinataire eventuel, son empreinte SHA-256 et la transaction.
 * La VERITE (l'empreinte et sa date) est dans le contrat ; cette ligne sert a retrouver et a presenter le document.
 */
@Entity
@Table(name = "issued_documents")
public class IssuedDocument {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(nullable = false, length = 120)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DocumentType type;

    /** Empreinte SHA-256 en hexadecimal (64 caracteres, minuscules) : une seule ligne par empreinte. */
    @Column(nullable = false, unique = true, length = 64)
    private String hash;

    /** Eleve a qui le document est remis ; vide = document sans destinataire (archive de l'ecole). */
    @ManyToOne
    @JoinColumn(name = "student_id")
    private User student;

    @Column(nullable = false)
    private String contractAddress;

    @Column(nullable = false)
    private String txHash;

    @Column(nullable = false)
    private Long blockNumber;

    @Column(nullable = false)
    private String blockTime;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected IssuedDocument() { }

    public IssuedDocument(String title, DocumentType type, String hash, User student,
                          String contractAddress, String txHash, long blockNumber, String blockTime) {
        this.title = title;
        this.type = type;
        this.hash = hash;
        this.student = student;
        this.contractAddress = contractAddress;
        this.txHash = txHash;
        this.blockNumber = blockNumber;
        this.blockTime = blockTime;
    }

    public UUID getId() { return id; }
    public String getTitle() { return title; }
    public DocumentType getType() { return type; }
    public String getHash() { return hash; }
    public User getStudent() { return student; }
    public String getContractAddress() { return contractAddress; }
    public String getTxHash() { return txHash; }
    public Long getBlockNumber() { return blockNumber; }
    public String getBlockTime() { return blockTime; }
    public Instant getCreatedAt() { return createdAt; }
}
