package com.esprit.badges.security;

import com.esprit.badges.model.Role;

/** L'utilisateur connecte, tel que le filtre JWT le place dans la requete. */
public record AuthUser(Long id, String email, Role role) {
}
