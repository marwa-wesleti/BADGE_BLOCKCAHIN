package com.esprit.badges.web;

import com.esprit.badges.blockchain.EthereumProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Infos publiques dont la page a besoin pour s'afficher : reseau, adresse du contrat, site pour consulter la chaine. */
@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private static final long SEPOLIA = 11155111L;
    private static final long HARDHAT_LOCAL = 31337L;

    private final EthereumProperties props;

    public ConfigController(EthereumProperties props) {
        this.props = props;
    }

    /** GET /api/config : jamais de secret ici (ni cle privee, ni mot de passe). */
    @GetMapping
    public Map<String, Object> config() {
        String network = props.chainId() == SEPOLIA ? "Ethereum Sepolia"
                : props.chainId() == HARDHAT_LOCAL ? "Réseau local (test)"
                : "Chaîne " + props.chainId();
        // Seul Sepolia a un explorateur public ; sur un réseau local, les liens n'auraient aucun sens
        String explorer = props.chainId() == SEPOLIA ? "https://sepolia.etherscan.io" : null;

        Map<String, Object> body = Api.ok(
                "network", network,
                "chainId", props.chainId(),
                "contractAddress", props.contractAddress(),
                "nftContractAddress", props.nftContractAddress(),
                "explorer", explorer);
        return body;
    }
}
