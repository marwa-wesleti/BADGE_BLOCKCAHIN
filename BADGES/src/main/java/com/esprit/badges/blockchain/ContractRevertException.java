package com.esprit.badges.blockchain;

/**
 * Le smart contract a REFUSE l'operation (un require() a echoue : mauvais appelant, doublon...).
 * Ce n'est pas une panne : c'est le contrat qui applique ses regles.
 */
public class ContractRevertException extends BlockchainException {

    public ContractRevertException(String reason) {
        super("Le contrat a refuse l'operation : " + reason);
    }
}
