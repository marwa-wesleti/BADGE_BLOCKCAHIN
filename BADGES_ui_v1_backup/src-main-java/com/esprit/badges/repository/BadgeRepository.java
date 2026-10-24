package com.esprit.badges.repository;

import com.esprit.badges.model.Badge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BadgeRepository extends JpaRepository<Badge, UUID> {

    Optional<Badge> findByUserIdAndCourseId(Long userId, Long courseId);

    List<Badge> findByUserId(Long userId);
}
