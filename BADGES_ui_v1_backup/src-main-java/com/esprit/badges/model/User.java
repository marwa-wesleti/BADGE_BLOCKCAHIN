package com.esprit.badges.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
}
