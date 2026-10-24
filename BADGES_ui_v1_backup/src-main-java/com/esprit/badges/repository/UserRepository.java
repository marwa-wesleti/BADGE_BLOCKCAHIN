package com.esprit.badges.repository;

import com.esprit.badges.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    Optional<User> findByWalletAddress(String walletAddress);

    boolean existsByUsernameOrEmail(String username, String email);
}
