package com.esprit.badges.web;

import com.esprit.badges.model.Course;
import com.esprit.badges.model.Difficulty;
import com.esprit.badges.service.CourseService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/courses")
public class CourseController {

    public record CourseRequest(@NotBlank String title, @NotBlank String description, Difficulty difficulty) { }

    public record CompleteRequest(@NotBlank String email) { }

    private final CourseService courseService;

    public CourseController(CourseService courseService) {
        this.courseService = courseService;
    }

    /** GET /api/courses */
    @GetMapping
    public Map<String, Object> list() {
        return Api.ok("courses", courseService.list().stream().map(Views::course).toList());
    }

    /** POST /api/courses  { title, description, difficulty? } */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@Valid @RequestBody CourseRequest request) {
        Course course = courseService.create(request.title(), request.description(), request.difficulty());
        return Api.ok("course", Views.course(course));
    }

    /** POST /api/courses/{id}/complete  { email } */
    @PostMapping("/{id}/complete")
    public Map<String, Object> complete(@PathVariable Long id, @Valid @RequestBody CompleteRequest request) {
        courseService.complete(id, request.email());
        return Api.ok("message", "Cours marque comme termine");
    }
}
