package com.esprit.badges.model;

/** Nature d'un document emis par l'ecole : sert seulement a le classer et a l'afficher. */
public enum DocumentType {
    DIPLOME("Diplôme"),
    RELEVE("Relevé de notes"),
    ATTESTATION("Attestation"),
    AUTRE("Autre document");

    private final String label;

    DocumentType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
