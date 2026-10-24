package com.esprit.badges.service;

import com.esprit.badges.model.Course;
import com.esprit.badges.model.Difficulty;
import com.esprit.badges.model.User;
import com.esprit.badges.repository.CourseRepository;
import com.esprit.badges.repository.UserRepository;
import com.esprit.badges.web.ApiException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CourseService {

    private final CourseRepository courses;
    private final UserRepository users;
    private final UserService userService;

    public CourseService(CourseRepository courses, UserRepository users, UserService userService) {
        this.courses = courses;
        this.users = users;
        this.userService = userService;
    }

    public List<Course> list() {
        return courses.findAll();
    }

    public Course create(String title, String description, Difficulty difficulty) {
        return courses.save(new Course(title, description, difficulty));
    }

    public Course get(Long id) {
        return courses.findById(id).orElseThrow(() -> ApiException.notFound("Cours introuvable"));
    }

    /** Marque le cours comme termine (pas de blockchain ici : c'est le badge qui ira sur la blockchain). */
    public void complete(Long courseId, String email) {
        User user = userService.getByEmail(email);
        Course course = get(courseId);
        if (user.hasCompleted(course)) {
            throw ApiException.conflict("Cours deja termine par cet utilisateur");
        }
        user.complete(course);
        users.save(user);
    }
}
