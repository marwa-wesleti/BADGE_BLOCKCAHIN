package com.esprit.badges.repository;

import com.esprit.badges.model.NftBadge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NftBadgeRepository extends JpaRepository<NftBadge, UUID> {

    Optional<NftBadge> findByUserIdAndCourseId(Long userId, Long courseId);

    List<NftBadge> findByUserId(Long userId);
}
