package com.esprit.badges;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class BadgesApplication {

    public static void main(String[] args) {
        DatabaseInitializer.createIfMissing(); // cree la base si elle n'existe pas (DB_AUTO_CREATE=false pour desactiver)
        SpringApplication.run(BadgesApplication.class, args);
    }
}
