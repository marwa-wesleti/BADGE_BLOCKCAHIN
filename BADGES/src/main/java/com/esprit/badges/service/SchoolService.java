package com.esprit.badges.service;

import com.esprit.badges.model.Badge;
import com.esprit.badges.model.Course;
import com.esprit.badges.model.NftBadge;
import com.esprit.badges.model.Role;
import com.esprit.badges.model.User;
import com.esprit.badges.repository.BadgeRepository;
import com.esprit.badges.repository.CourseRepository;
import com.esprit.badges.repository.NftBadgeRepository;
import com.esprit.badges.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Ce que voit l'ecole : des chiffres globaux et, pour chaque eleve, ou il en est. */
@Service
public class SchoolService {

    /** completions = nombre de cours valides, tous eleves confondus. */
    public record Overview(long students, long courses, long completions, long badges, long nftBadges) { }

    /** Un eleve et l'etat de chacun de ses cours : termine, badge du registre, badge NFT. */
    public record StudentRow(User user, List<Long> completedCourseIds, List<Long> badgeCourseIds, List<Long> nftCourseIds) { }

    private final UserRepository users;
    private final CourseRepository courses;
    private final BadgeRepository badges;
    private final NftBadgeRepository nftBadges;

    public SchoolService(UserRepository users, CourseRepository courses, BadgeRepository badges, NftBadgeRepository nftBadges) {
        this.users = users;
        this.courses = courses;
        this.badges = badges;
        this.nftBadges = nftBadges;
    }

    public Overview overview() {
        List<User> students = users.findAll().stream().filter(SchoolService::isStudent).toList();
        long completions = students.stream().mapToLong(s -> s.getCompletedCourses().size()).sum();
        return new Overview(students.size(), courses.count(), completions, badges.count(), nftBadges.count());
    }

    public List<StudentRow> students() {
        Map<Long, Set<Long>> registry = new HashMap<>();
        for (Badge badge : badges.findAll()) {
            registry.computeIfAbsent(badge.getUser().getId(), id -> new HashSet<>()).add(badge.getCourse().getId());
        }
        Map<Long, Set<Long>> nft = new HashMap<>();
        for (NftBadge badge : nftBadges.findAll()) {
            nft.computeIfAbsent(badge.getUser().getId(), id -> new HashSet<>()).add(badge.getCourse().getId());
        }
        return users.findAll().stream()
                .filter(SchoolService::isStudent)
                .sorted(Comparator.comparing(User::getId))
                .map(u -> new StudentRow(u,
                        u.getCompletedCourses().stream().map(Course::getId).sorted().toList(),
                        registry.getOrDefault(u.getId(), Set.of()).stream().sorted().toList(),
                        nft.getOrDefault(u.getId(), Set.of()).stream().sorted().toList()))
                .toList();
    }

    private static boolean isStudent(User user) {
        return user.getRole() == Role.ELEVE;
    }
}
