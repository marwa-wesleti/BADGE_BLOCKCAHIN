package com.esprit.badges.service;

import com.esprit.badges.model.User;
import com.esprit.badges.repository.UserRepository;
import com.esprit.badges.web.ApiException;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class UserService {

    private final UserRepository users;

    public UserService(UserRepository users) {
        this.users = users;
    }

    public User getByEmail(String email) {
        return users.findByEmail(normalize(email))
                .orElseThrow(() -> ApiException.notFound("Utilisateur introuvable"));
    }

    public static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
