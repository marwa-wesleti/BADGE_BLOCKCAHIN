package com.esprit.badges.blockchain;

import org.springframework.stereotype.Service;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.FunctionReturnDecoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Bool;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.Utf8String;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.Credentials;
import org.web3j.crypto.ECKeyPair;
import org.web3j.crypto.Keys;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.request.Transaction;
import org.web3j.protocol.core.methods.response.EthBlock;
import org.web3j.protocol.core.methods.response.EthCall;
import org.web3j.protocol.core.methods.response.EthEstimateGas;
import org.web3j.protocol.core.methods.response.EthSendTransaction;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import org.web3j.protocol.http.HttpService;
import org.web3j.tx.RawTransactionManager;
import org.web3j.tx.response.PollingTransactionReceiptProcessor;
import org.web3j.utils.Convert;
import org.web3j.utils.Numeric;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * TOUT ce qui parle a Ethereum est dans cette classe.
 * Les regles metier (qui peut delivrer un badge, pas de doublon...) sont dans le smart contract
 * BadgeRegistry : ici on ne fait qu'ENVOYER des transactions signees et LIRE des valeurs.
 *
 *  - ecriture = transaction signee par l'ecole, payee en ETH de test, enregistree dans un bloc ;
 *  - lecture  = eth_call : execute la fonction sur le noeud sans rien ecrire, donc gratuit.
 */
@Service
public class EthereumService {

    /**
     * Gas = "carburant" necessaire a l'execution. On ne le devine pas : le reseau l'estime (eth_estimateGas),
     * car son prix change selon les versions du reseau (un deploiement a besoin de ~0,4 M de gas sur un reseau
     * local mais de ~2,7 M sur Sepolia). On ajoute 30 % de marge ; seul le gas reellement utilise est facture.
     */
    private static final BigInteger GAS_MARGIN_PERCENT = BigInteger.valueOf(130);

    /** Recherche du bloc apres le recu : 10 essais espaces de 2 s, soit 20 s au maximum. */
    private static final int BLOCK_LOOKUP_ATTEMPTS = 10;
    private static final long BLOCK_LOOKUP_DELAY_MS = 2_000;

    // ---- Resultats renvoyes aux autres couches ----
    public record NewWallet(String address, String privateKey) { }

    /** Preuve qu'une ecriture est passee : hash de la transaction, numero du bloc et date de ce bloc. */
    public record TxResult(String transactionHash, long blockNumber, String blockTime) { }

    /** Un badge NFT qui vient d'etre cree : la transaction, et le numero du jeton donne par le contrat. */
    public record NftMint(TxResult tx, long tokenId) { }

    /** Un badge NFT tel que le contrat le connait : numero du jeton, date de delivrance et proprietaire actuel. */
    public record NftBadgeOnChain(long tokenId, Instant issuedAt, String owner) { }

    private final EthereumProperties props;
    private Web3j web3j;
    private Credentials school;

    public EthereumService(EthereumProperties props) {
        this.props = props;
    }

    /** Connexion au reseau, creee a la premiere utilisation. */
    private synchronized Web3j web3j() {
        if (web3j == null) {
            web3j = Web3j.build(new HttpService(props.rpcUrl()));
        }
        return web3j;
    }

    /** Le portefeuille de l'ecole : sa cle privee signe toutes les ecritures. Il devient l'owner du contrat. */
    private synchronized Credentials school() {
        if (school == null) {
            try {
                school = Credentials.create(props.privateKey().trim());
            } catch (RuntimeException e) {
                throw new BlockchainException("ETH_PRIVATE_KEY invalide (64 caracteres hexadecimaux attendus)", e);
            }
        }
        return school;
    }

    private String contractAddress() {
        if (props.contractAddress() == null || props.contractAddress().isBlank()) {
            throw new BlockchainException("CONTRACT_ADDRESS absent du .env : lancez d'abord le setup (mvn compile exec:java)");
        }
        return props.contractAddress();
    }

    private String nftContractAddress() {
        if (props.nftContractAddress() == null || props.nftContractAddress().isBlank()) {
            throw new BlockchainException("NFT_CONTRACT_ADDRESS absent du .env : deployez d'abord le contrat NFT "
                    + "(mvn compile exec:java -Dexec.args=nft)");
        }
        return props.nftContractAddress();
    }

    // ---------- Portefeuilles ----------

    /**
     * Cree un portefeuille pour un utilisateur : juste une paire de cles, calculee localement.
     * Rien n'est envoye sur la blockchain. La cle privee est renvoyee UNE SEULE FOIS et n'est jamais stockee.
     */
    public NewWallet createWallet() {
        try {
            ECKeyPair keyPair = Keys.createEcKeyPair();
            Credentials wallet = Credentials.create(keyPair);
            return new NewWallet(wallet.getAddress(), Numeric.toHexStringNoPrefixZeroPadded(keyPair.getPrivateKey(), 64));
        } catch (Exception e) {
            throw new BlockchainException("Creation du portefeuille impossible", e);
        }
    }

    public String schoolAddress() {
        return school().getAddress();
    }

    /** Solde de l'ecole en ETH : sert a prevenir clairement quand il faut aller au faucet. */
    public BigDecimal schoolBalanceEth() {
        try {
            BigInteger wei = web3j().ethGetBalance(schoolAddress(), DefaultBlockParameterName.LATEST).send().getBalance();
            return Convert.fromWei(new BigDecimal(wei), Convert.Unit.ETHER);
        } catch (Exception e) {
            throw new BlockchainException("Lecture du solde impossible (verifier ETH_RPC_URL)", e);
        }
    }

    // ---------- Deploiement du smart contract ----------

    /**
     * Appele une seule fois par SetupMain : envoie le bytecode compile (Solidity) sur Sepolia.
     * Le contrat recoit une adresse. L'ecole qui deploie devient l'owner. Le code ne pourra plus etre modifie.
     */
    public String deployContract(String bytecodeHex) {
        TransactionReceipt receipt = send("", Numeric.prependHexPrefix(bytecodeHex));
        return receipt.getContractAddress();
    }

    // ---------- Badges (fonctions du contrat) ----------

    /** Appelle issueBadge(eleve, cours, titre). Le contrat refuse tout doublon ou tout appelant autre que l'ecole. */
    public TxResult issueBadge(String studentAddress, long courseId, String title) {
        Function function = new Function("issueBadge",
                List.of(new Address(studentAddress), new Uint256(courseId), new Utf8String(title)), List.of());
        return write(function);
    }

    /** Lit la date de delivrance du badge sur la blockchain. Vide si l'eleve n'a pas ce badge. */
    public Optional<Instant> getBadgeIssuedAt(String studentAddress, long courseId) {
        Function function = new Function("badgeIssuedAt",
                List.of(new Address(studentAddress), new Uint256(courseId)),
                List.of(new TypeReference<Uint256>() { }));
        return toInstant((BigInteger) read(function).get(0).getValue());
    }

    // ---------- Preuves d'integrite (fonctions du contrat) ----------

    /** Appelle anchorDocument(empreinte). Seule l'empreinte SHA-256 (32 octets) est envoyee, jamais le texte. */
    public TxResult anchorDocument(byte[] sha256) {
        return write(new Function("anchorDocument", List.of(new Bytes32(sha256)), List.of()));
    }

    /** Lit la date de gravure d'une empreinte. Vide si elle n'a jamais ete gravee. */
    public Optional<Instant> getDocumentAnchoredAt(byte[] sha256) {
        Function function = new Function("verifyDocument", List.of(new Bytes32(sha256)),
                List.of(new TypeReference<Bool>() { }, new TypeReference<Uint256>() { }));
        List<Type> result = read(function);
        boolean exists = (Boolean) result.get(0).getValue();
        return exists ? toInstant((BigInteger) result.get(1).getValue()) : Optional.empty();
    }

    // ---------- Badges NFT (contrat BadgeNFT) ----------

    /**
     * Appelle issueBadge(eleve, cours, titre) sur le contrat NFT : le contrat cree un jeton et l'eleve en devient
     * proprietaire. Le numero du jeton est lu dans l'evenement Transfer du recu (pas besoin de relire la chaine).
     */
    public NftMint issueNftBadge(String studentAddress, long courseId, String title) {
        Function function = new Function("issueBadge",
                List.of(new Address(studentAddress), new Uint256(courseId), new Utf8String(title)), List.of());
        Mined mined = mine(nftContractAddress(), function);
        return new NftMint(mined.tx(), mintedTokenId(mined.receipt()));
    }

    /** Lit le badge NFT d'un eleve pour un cours : numero du jeton, date, proprietaire. Vide s'il n'existe pas. */
    public Optional<NftBadgeOnChain> getNftBadge(String studentAddress, long courseId) {
        String nft = nftContractAddress();
        Address student = new Address(studentAddress);
        BigInteger tokenId = (BigInteger) read(nft, new Function("badgeTokenOf",
                List.of(student, new Uint256(courseId)),
                List.of(new TypeReference<Uint256>() { }))).get(0).getValue();
        if (tokenId.signum() == 0) {
            return Optional.empty();
        }
        BigInteger issuedAt = (BigInteger) read(nft, new Function("badgeIssuedAt",
                List.of(student, new Uint256(courseId)),
                List.of(new TypeReference<Uint256>() { }))).get(0).getValue();
        String owner = (String) read(nft, new Function("ownerOf",
                List.of(new Uint256(tokenId)),
                List.of(new TypeReference<Address>() { }))).get(0).getValue();
        return Optional.of(new NftBadgeOnChain(tokenId.longValueExact(),
                Instant.ofEpochSecond(issuedAt.longValueExact()), owner.toLowerCase(Locale.ROOT)));
    }

    /**
     * Numero du jeton cree : c'est le 4e element (topics[3]) de l'evenement Transfer(de, vers, numero) emis par le
     * contrat NFT. L'autre evenement de la transaction, Locked, n'a qu'un element : on ne les confond pas.
     */
    private long mintedTokenId(TransactionReceipt receipt) {
        String nft = nftContractAddress();
        for (Log log : receipt.getLogs()) {
            if (nft.equalsIgnoreCase(log.getAddress()) && log.getTopics().size() == 4) {
                return Numeric.toBigInt(log.getTopics().get(3)).longValueExact();
            }
        }
        throw new BlockchainException("Badge cree, mais le numero du jeton est introuvable dans le recu de la transaction "
                + receipt.getTransactionHash() + " : verifiez-le sur Etherscan.");
    }

    // ---------- Outils internes ----------

    /** Lecture sur le contrat BadgeRegistry. */
    private List<Type> read(Function function) {
        return read(contractAddress(), function);
    }

    /** Lecture : eth_call execute la fonction sur le noeud, sans transaction, sans frais, sans rien modifier. */
    private List<Type> read(String contract, Function function) {
        try {
            EthCall response = web3j().ethCall(
                    Transaction.createEthCallTransaction(school().getAddress(), contract, FunctionEncoder.encode(function)),
                    DefaultBlockParameterName.LATEST).send();
            if (response.isReverted()) {
                throw new ContractRevertException(readable(response.getRevertReason()));
            }
            if (response.hasError()) {
                throw new BlockchainException("Lecture de " + function.getName() + " refusee : " + response.getError().getMessage());
            }
            return FunctionReturnDecoder.decode(response.getValue(), function.getOutputParameters());
        } catch (BlockchainException e) {
            throw e;
        } catch (Exception e) {
            throw new BlockchainException("Lecture de " + function.getName() + " impossible", e);
        }
    }

    /**
     * Ecriture : on SIMULE d'abord (eth_call) pour obtenir le message du require() sans payer de gas,
     * puis on envoie la vraie transaction et on attend qu'elle soit minee dans un bloc.
     */
    private TxResult write(Function function) {
        return mine(contractAddress(), function).tx();
    }

    /** Une ecriture reussie : le recu complet (avec ses evenements) et le resume renvoye aux autres couches. */
    private record Mined(TransactionReceipt receipt, TxResult tx) { }

    /** Meme principe que write, pour n'importe quel contrat : on garde aussi le recu pour pouvoir lire ses evenements. */
    private Mined mine(String contract, Function function) {
        String data = FunctionEncoder.encode(function);
        try {
            EthCall simulation = web3j().ethCall(
                    Transaction.createEthCallTransaction(school().getAddress(), contract, data),
                    DefaultBlockParameterName.LATEST).send();
            if (simulation.isReverted()) {
                throw new ContractRevertException(readable(simulation.getRevertReason()));
            }

            TransactionReceipt receipt = send(contract, data);

            BigInteger blockTimestamp = blockTimestamp(receipt);
            return new Mined(receipt, new TxResult(receipt.getTransactionHash(), receipt.getBlockNumber().longValueExact(),
                    Instant.ofEpochSecond(blockTimestamp.longValueExact()).toString()));
        } catch (BlockchainException e) {
            throw e;
        } catch (Exception e) {
            throw new BlockchainException("Appel de " + function.getName() + " impossible", e);
        }
    }

    /**
     * Date du bloc qui contient la transaction. Juste apres le recu, un noeud public peut repondre "bloc inconnu" :
     * plusieurs serveurs se relaient derriere la meme URL et celui qui repond n'a pas encore recu ce bloc.
     * La transaction, elle, a deja reussi : on reessaie donc quelques secondes au lieu d'echouer.
     */
    private BigInteger blockTimestamp(TransactionReceipt receipt) throws java.io.IOException {
        for (int attempt = 1; attempt <= BLOCK_LOOKUP_ATTEMPTS; attempt++) {
            EthBlock.Block block = web3j().ethGetBlockByHash(receipt.getBlockHash(), false).send().getBlock();
            if (block != null) {
                return block.getTimestamp();
            }
            try {
                Thread.sleep(BLOCK_LOOKUP_DELAY_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        throw new BlockchainException("La transaction " + receipt.getTransactionHash() + " a ete minee (bloc "
                + receipt.getBlockNumber() + ") mais le noeud ne connait pas encore ce bloc. "
                + "Elle a probablement reussi : verifiez sur Etherscan avant de reessayer.");
    }

    /** Signe avec la cle de l'ecole, envoie, puis attend le recu (en moyenne une dizaine de secondes sur Sepolia). */
    private TransactionReceipt send(String to, String data) {
        try {
            BigInteger gasLimit = estimateGas(to, data);
            BigInteger gasPrice = web3j().ethGasPrice().send().getGasPrice().multiply(BigInteger.TWO); // marge x2
            RawTransactionManager manager = new RawTransactionManager(web3j(), school(), props.chainId());
            EthSendTransaction sent = manager.sendTransaction(gasPrice, gasLimit, to, data, BigInteger.ZERO);
            if (sent.hasError()) {
                throw new BlockchainException("Transaction refusee par le noeud : " + sent.getError().getMessage());
            }
            TransactionReceipt receipt = new PollingTransactionReceiptProcessor(web3j(), 3_000, 40)
                    .waitForTransactionReceipt(sent.getTransactionHash());
            if (!receipt.isStatusOK()) {
                throw new ContractRevertException("transaction " + receipt.getTransactionHash() + " annulee (status 0x0)");
            }
            return receipt;
        } catch (BlockchainException e) {
            throw e;
        } catch (Exception e) {
            throw new BlockchainException("Envoi de la transaction impossible", e);
        }
    }

    /** Demande au reseau combien de gas l'operation consommera (to vide = deploiement d'un contrat), plus une marge. */
    private BigInteger estimateGas(String to, String data) throws java.io.IOException {
        String from = school().getAddress();
        Transaction transaction = to.isEmpty()
                ? Transaction.createContractTransaction(from, null, null, data)
                : Transaction.createFunctionCallTransaction(from, null, null, null, to, data);
        EthEstimateGas estimate = web3j().ethEstimateGas(transaction).send();
        if (estimate.hasError()) {
            throw new BlockchainException("Estimation du gas refusee par le noeud : " + readable(estimate.getError().getMessage()));
        }
        return estimate.getAmountUsed().multiply(GAS_MARGIN_PERCENT).divide(BigInteger.valueOf(100));
    }

    /** web3j renvoie "execution reverted: ..." ou le texte du require() : on garde le texte utile. */
    private static String readable(String reason) {
        if (reason == null || reason.isBlank()) {
            return "refus sans message";
        }
        return reason.startsWith("execution reverted: ") ? reason.substring("execution reverted: ".length()) : reason;
    }

    /** Le contrat renvoie 0 quand il n'y a rien : on le traduit par "vide". */
    private static Optional<Instant> toInstant(BigInteger seconds) {
        return seconds.signum() == 0 ? Optional.empty() : Optional.of(Instant.ofEpochSecond(seconds.longValueExact()));
    }
}
