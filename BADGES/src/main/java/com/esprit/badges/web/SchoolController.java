package com.esprit.badges.web;

import com.esprit.badges.blockchain.EthereumProperties;
import com.esprit.badges.blockchain.EthereumService;
import com.esprit.badges.service.AuthService;
import com.esprit.badges.service.SchoolService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Routes reservees a l'ecole (voir SecurityConfig). */
@RestController
@RequestMapping("/api/school")
public class SchoolController {

    public record CreateStudentRequest(
            @NotBlank @Size(min = 3, max = 40) String username,
            @NotBlank @Email @Size(max = 120) String email) { }

    private final SchoolService school;
    private final AuthService auth;
    private final EthereumService ethereum;
    private final EthereumProperties props;

    public SchoolController(SchoolService school, AuthService auth, EthereumService ethereum, EthereumProperties props) {
        this.school = school;
        this.auth = auth;
        this.ethereum = ethereum;
        this.props = props;
    }

    /** GET /api/school/overview : les compteurs du tableau de bord. */
    @GetMapping("/overview")
    public Map<String, Object> overview() {
        SchoolService.Overview o = school.overview();
        return Api.ok(
                "students", o.students(),
                "courses", o.courses(),
                "completions", o.completions(),
                "badges", o.badges(),
                "nftBadges", o.nftBadges(),
                "contractAddress", props.contractAddress(),
                "nftContractAddress", props.nftContractAddress());
    }

    /** GET /api/school/wallet : adresse publique de l'ecole et son solde en ETH (interroge le reseau : un peu plus lent). */
    @GetMapping("/wallet")
    public Map<String, Object> wallet() {
        return Api.ok(
                "address", ethereum.schoolAddress(),
                "balanceEth", ethereum.schoolBalanceEth().toPlainString());
    }

    /** GET /api/school/students */
    @GetMapping("/students")
    public Map<String, Object> students() {
        return Api.ok("students", school.students().stream().map(Views::student).toList());
    }

    /**
     * POST /api/school/students  { username, email } : l'ecole cree le compte d'un eleve. Le serveur genere son portefeuille
     * et un mot de passe temporaire ; l'un et l'autre sont renvoyes UNE seule fois, pour que l'ecole les remette a l'eleve.
     */
    @PostMapping("/students")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createStudent(@Valid @RequestBody CreateStudentRequest request) {
        AuthService.CreatedStudent created = auth.createStudent(request.username(), request.email());
        return Api.ok(
                "user", Views.user(created.user()),
                "temporaryPassword", created.temporaryPassword(),
                "privateKey", created.privateKey(),
                "warning", "Remettez le mot de passe temporaire et la cle privee a l'eleve maintenant : ils ne seront plus jamais affiches. "
                        + "A sa premiere connexion, il devra choisir son propre mot de passe.");
    }

    /** POST /api/school/students/{id}/reset-password : mot de passe temporaire, affiche une seule fois. */
    @PostMapping("/students/{id}/reset-password")
    public Map<String, Object> resetPassword(@PathVariable Long id) {
        return Api.ok(
                "temporaryPassword", auth.resetStudentPassword(id),
                "warning", "Communiquez ce mot de passe a l'eleve maintenant : il ne sera plus jamais affiche.");
    }
}
