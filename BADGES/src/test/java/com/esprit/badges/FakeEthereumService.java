package com.esprit.badges;

import com.esprit.badges.blockchain.ContractRevertException;
import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.blockchain.EthereumService;

import java.time.Instant;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Faux Ethereum en memoire : meme interface que EthereumService, aucun appel reseau, aucun ETH depense.
 * Il REPRODUIT les regles du smart contract BadgeRegistry (owner, pas de doublon) pour tester l'application.
 * Les vraies regles, elles, sont testees sur le vrai code Solidity dans solidity/test.
 */
class FakeEthereumService extends EthereumService {

    static final String TIME = "2026-10-10T10:00:00Z";

    final Map<String, Instant> badgeDates = new HashMap<>();
    final Map<String, Instant> documentDates = new HashMap<>();
    final Map<String, NftBadgeOnChain> nftBadges = new HashMap<>();
    int walletCount = 0;
    int issueCalls = 0;
    int anchorCalls = 0;
    int nftIssueCalls = 0;
    boolean callerIsOwner = true; // false = simule un appel qui ne vient pas de l'ecole

    FakeEthereumService(EthereumProperties props) {
        super(props);
    }

    static String addressNumber(int n) {
        return String.format("0x%040x", n);
    }

    static final String SCHOOL_ADDRESS = "0x00000000000000000000000000000000000051c0";

    /** L'adresse de l'ecole : le vrai service la calcule depuis la cle privee, que les tests n'ont pas. */
    @Override
    public String schoolAddress() {
        return SCHOOL_ADDRESS;
    }

    @Override
    public java.math.BigDecimal schoolBalanceEth() {
        return new java.math.BigDecimal("1.5");
    }

    @Override
    public NewWallet createWallet() {
        return new NewWallet(addressNumber(1000 + ++walletCount), "priv");
    }

    @Override
    public TxResult issueBadge(String studentAddress, long courseId, String title) {
        requireOwner();
        String key = studentAddress.toLowerCase(Locale.ROOT) + "/" + courseId;
        if (badgeDates.containsKey(key)) {
            throw new ContractRevertException("Badge deja delivre pour ce cours");
        }
        issueCalls++;
        badgeDates.put(key, Instant.parse(TIME));
        return new TxResult("0xissue" + issueCalls, 100 + issueCalls, TIME);
    }

    @Override
    public Optional<Instant> getBadgeIssuedAt(String studentAddress, long courseId) {
        return Optional.ofNullable(badgeDates.get(studentAddress.toLowerCase(Locale.ROOT) + "/" + courseId));
    }

    /** Reproduit BadgeNFT : un jeton numerote a partir de 1, un seul par eleve et par cours, cree par l'ecole seule. */
    @Override
    public NftMint issueNftBadge(String studentAddress, long courseId, String title) {
        requireOwner();
        String key = studentAddress.toLowerCase(Locale.ROOT) + "/" + courseId;
        if (nftBadges.containsKey(key)) {
            throw new ContractRevertException("Badge deja delivre pour ce cours");
        }
        long tokenId = ++nftIssueCalls;
        nftBadges.put(key, new NftBadgeOnChain(tokenId, Instant.parse(TIME), studentAddress.toLowerCase(Locale.ROOT)));
        return new NftMint(new TxResult("0xnft" + tokenId, 300 + tokenId, TIME), tokenId);
    }

    @Override
    public Optional<NftBadgeOnChain> getNftBadge(String studentAddress, long courseId) {
        return Optional.ofNullable(nftBadges.get(studentAddress.toLowerCase(Locale.ROOT) + "/" + courseId));
    }

    @Override
    public TxResult anchorDocument(byte[] sha256) {
        requireOwner();
        String key = HexFormat.of().formatHex(sha256);
        if (documentDates.containsKey(key)) {
            throw new ContractRevertException("Empreinte deja gravee");
        }
        anchorCalls++;
        documentDates.put(key, Instant.parse(TIME));
        return new TxResult("0xanchor" + anchorCalls, 200 + anchorCalls, TIME);
    }

    @Override
    public Optional<Instant> getDocumentAnchoredAt(byte[] sha256) {
        return Optional.ofNullable(documentDates.get(HexFormat.of().formatHex(sha256)));
    }

    private void requireOwner() {
        if (!callerIsOwner) {
            throw new ContractRevertException("Seule l'ecole peut effectuer cette action");
        }
    }
}
