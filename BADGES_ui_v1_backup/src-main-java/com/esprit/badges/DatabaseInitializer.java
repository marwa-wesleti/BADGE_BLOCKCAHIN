package com.esprit.badges;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Optional;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cree la base de donnees si elle n'existe pas, AVANT le demarrage de Spring.
 *
 * Pourquoi un code a part : Spring (Hibernate) cree les TABLES, mais pas la BASE elle-meme. Pour creer une base,
 * il faut se connecter a une autre base du meme serveur (PostgreSQL : "postgres", MySQL : aucune), puis lancer CREATE DATABASE.
 *
 * Reglage dans .env : DB_AUTO_CREATE=false pour desactiver (actif par defaut).
 * Le compte DB_USER doit avoir le droit de creer une base ; sinon on affiche la commande a lancer a la main.
 */
final class DatabaseInitializer {

    private static final String DEFAULT_URL = "jdbc:postgresql://localhost:5432/blockchain_badges";
    private static final Pattern JDBC_URL = Pattern.compile("^jdbc:(postgresql|mysql)://([^/:?]+)(?::(\\d+))?/([^/?]+)(?:\\?.*)?$");
    // Un nom de base ne peut pas etre passe en parametre SQL : on n'accepte donc que lettres, chiffres et _
    private static final Pattern SAFE_NAME = Pattern.compile("[A-Za-z0-9_]+");

    record Target(String vendor, String host, String port, String database) {
        boolean isPostgres() {
            return vendor.equals("postgresql");
        }
    }

    private DatabaseInitializer() { }

    /** Extrait serveur, port et nom de base d'une URL JDBC. Vide si l'URL n'est pas reconnue ou si le nom est suspect. */
    static Optional<Target> parse(String url) {
        Matcher m = JDBC_URL.matcher(url.trim());
        if (!m.matches() || !SAFE_NAME.matcher(m.group(4)).matches()) {
            return Optional.empty();
        }
        String vendor = m.group(1);
        String port = m.group(3) != null ? m.group(3) : vendor.equals("mysql") ? "3306" : "5432";
        return Optional.of(new Target(vendor, m.group(2), port, m.group(4)));
    }

    static void createIfMissing() {
        Properties env = loadEnv();
        if ("false".equalsIgnoreCase(value(env, "DB_AUTO_CREATE", "true"))) {
            return;
        }
        String url = value(env, "DB_URL", DEFAULT_URL);
        String user = value(env, "DB_USER", "postgres");
        String password = value(env, "DB_PASSWORD", "postgres");

        Optional<Target> parsed = parse(url);
        if (parsed.isEmpty()) {
            System.out.println("[DB] URL non reconnue : creation automatique de la base ignoree.");
            return;
        }
        Target target = parsed.get();
        try {
            if (target.isPostgres()) {
                createPostgres(target, user, password);
            } else {
                createMysql(target, user, password);
            }
        } catch (SQLException e) {
            // On ne bloque pas : si la base existe deja ou si le serveur est arrete, Spring donnera l'erreur precise.
            System.err.println("[DB] Creation automatique impossible : " + e.getMessage());
            System.err.println("[DB] Creez la base a la main : CREATE DATABASE " + target.database() + ";"
                    + (target.isPostgres() ? " ou donnez le droit au compte : ALTER ROLE " + user + " CREATEDB;" : ""));
        }
    }

    private static void createPostgres(Target t, String user, String password) throws SQLException {
        try (Connection c = DriverManager.getConnection("jdbc:postgresql://" + t.host() + ":" + t.port() + "/postgres", user, password)) {
            try (PreparedStatement ps = c.prepareStatement("SELECT 1 FROM pg_database WHERE datname = ?")) {
                ps.setString(1, t.database());
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        System.out.println("[DB] Base \"" + t.database() + "\" deja presente.");
                        return;
                    }
                }
            }
            try (Statement st = c.createStatement()) {
                st.executeUpdate("CREATE DATABASE \"" + t.database() + "\"");
            }
            System.out.println("[DB] Base \"" + t.database() + "\" creee (les tables seront creees par Hibernate).");
        }
    }

    private static void createMysql(Target t, String user, String password) throws SQLException {
        try (Connection c = DriverManager.getConnection("jdbc:mysql://" + t.host() + ":" + t.port() + "/", user, password);
             Statement st = c.createStatement()) {
            st.executeUpdate("CREATE DATABASE IF NOT EXISTS `" + t.database() + "` CHARACTER SET utf8mb4");
            System.out.println("[DB] Base \"" + t.database() + "\" prete.");
        }
    }

    /** Lit d'abord le fichier .env, puis les variables d'environnement du systeme (meme logique que SetupMain). */
    private static Properties loadEnv() {
        Properties env = new Properties();
        Path envFile = Path.of(".env");
        if (Files.exists(envFile)) {
            try (Reader reader = Files.newBufferedReader(envFile)) {
                env.load(reader);
            } catch (IOException e) {
                System.err.println("[DB] Lecture de .env impossible : " + e.getMessage());
            }
        }
        return env;
    }

    private static String value(Properties env, String key, String fallback) {
        String fromFile = env.getProperty(key);
        if (fromFile != null && !fromFile.isBlank()) {
            return fromFile.trim();
        }
        String fromSystem = System.getenv(key);
        return fromSystem == null || fromSystem.isBlank() ? fallback : fromSystem.trim();
    }
}
