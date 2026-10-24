package com.esprit.badges.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;

import java.util.HashSet;
import java.util.Set;

// Table "users" (et non "user", qui est un mot reserve en PostgreSQL)
@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false, unique = true)
    private String email;

    /** Adresse Ethereum (0x..., en minuscules). La cle privee n est PAS stockee. */
    @Column(nullable = false)
    private String walletAddress;

    /** Profil du compte. Vide = ancien compte cree avant l'authentification : il est traite comme un eleve. */
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private Role role;

    /** Mot de passe haché (BCrypt), jamais en clair. Vide = ancien compte : l'ecole peut lui en attribuer un. */
    @Column(length = 100)
    private String passwordHash;

    /**
     * Vrai apres une reinitialisation par l'ecole : le mot de passe est temporaire et l'eleve doit en choisir un autre.
     * Boolean (et non boolean) : les anciennes lignes n'ont pas cette colonne, vide = faux.
     */
    private Boolean mustChangePassword;

    // EAGER : volontairement simple pour un petit projet (evite les erreurs de chargement paresseux)
    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "user_completed_courses",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "course_id"))
    private Set<Course> completedCourses = new HashSet<>();

    protected User() { }

    public User(String username, String email, String walletAddress) {
        this.username = username;
        this.email = email;
        this.walletAddress = walletAddress;
    }

    public User(String username, String email, String walletAddress, Role role, String passwordHash) {
        this(username, email, walletAddress);
        this.role = role;
        this.passwordHash = passwordHash;
    }

    public boolean hasCompleted(Course course) {
        return completedCourses.stream().anyMatch(c -> c.getId().equals(course.getId()));
    }

    public void complete(Course course) {
        completedCourses.add(course);
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public String getWalletAddress() { return walletAddress; }
    public Set<Course> getCompletedCourses() { return completedCourses; }
    public Role getRole() { return role == null ? Role.ELEVE : role; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public boolean isMustChangePassword() { return Boolean.TRUE.equals(mustChangePassword); }
    public void setMustChangePassword(boolean mustChangePassword) { this.mustChangePassword = mustChangePassword; }
    public void setRole(Role role) { this.role = role; }
}
