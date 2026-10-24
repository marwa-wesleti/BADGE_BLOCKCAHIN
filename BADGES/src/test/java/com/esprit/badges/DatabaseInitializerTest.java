package com.esprit.badges;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DatabaseInitializerTest {

    @Test
    void lisUneUrlPostgres() {
        var target = DatabaseInitializer.parse("jdbc:postgresql://localhost:5432/blockchain_badges").orElseThrow();
        assertThat(target.isPostgres()).isTrue();
        assertThat(target.host()).isEqualTo("localhost");
        assertThat(target.port()).isEqualTo("5432");
        assertThat(target.database()).isEqualTo("blockchain_badges");
    }

    @Test
    void lisUneUrlMysqlAvecOptionsEtPortParDefaut() {
        var target = DatabaseInitializer.parse("jdbc:mysql://db.exemple.local/badges?useSSL=false").orElseThrow();
        assertThat(target.isPostgres()).isFalse();
        assertThat(target.port()).isEqualTo("3306");
        assertThat(target.database()).isEqualTo("badges");
    }

    @Test
    void refuseUnNomDeBaseSuspectOuUneUrlInconnue() {
        // un nom ne peut pas etre parametre en SQL : tout ce qui n'est pas lettre, chiffre ou _ est refuse
        assertThat(DatabaseInitializer.parse("jdbc:postgresql://localhost:5432/x\"; DROP DATABASE y; --")).isEmpty();
        assertThat(DatabaseInitializer.parse("jdbc:postgresql://localhost:5432/ma-base")).isEmpty();
        assertThat(DatabaseInitializer.parse("jdbc:h2:mem:test")).isEmpty();
    }
}
