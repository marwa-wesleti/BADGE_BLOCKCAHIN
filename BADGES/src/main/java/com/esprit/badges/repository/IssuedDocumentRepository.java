package com.esprit.badges.repository;

import com.esprit.badges.model.IssuedDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface IssuedDocumentRepository extends JpaRepository<IssuedDocument, UUID> {

    boolean existsByHash(String hash);

    List<IssuedDocument> findAllByOrderByCreatedAtDesc();

    List<IssuedDocument> findByStudentIdOrderByCreatedAtDesc(Long studentId);
}
