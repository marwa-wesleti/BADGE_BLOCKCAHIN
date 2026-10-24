package com.esprit.badges.blockchain;

/** Toute erreur venant de la blockchain (reseau injoignable, transaction non confirmee, cle invalide...). */
public class BlockchainException extends RuntimeException {

    public BlockchainException(String message, Throwable cause) {
        super(message + " : " + cause.getMessage(), cause);
    }

    public BlockchainException(String message) {
        super(message);
    }
}
