import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { BackendService, MeResponse } from '../../core/backend.service';
import { Course } from '../../models';
import { IconComponent } from '../../shared/icon.component';

const LEVELS: Record<Course['difficulty'], string> = { Beginner: 'Débutant', Intermediate: 'Intermédiaire', Advanced: 'Avancé' };

type Status = 'badge' | 'termine' | 'a-suivre';

@Component({
  selector: 'app-eleve-courses-page',
  imports: [IconComponent],
  template: `
    <header class="page-head">
      <h1>Cours</h1>
      <p class="muted">Le catalogue de l’école. C’est elle qui valide un cours quand vous l’avez terminé, puis qui délivre le badge.</p>
    </header>

    @if (loading()) {
      <p class="muted"><span class="spin"></span> Chargement…</p>
    } @else if (error()) {
      <div class="alert alert-err" role="alert"><app-icon name="alert" /><span>{{ error() }}</span></div>
    } @else if (!rows().length) {
      <div class="card empty-state">
        <app-icon name="book" [size]="32" />
        <p><b>Aucun cours au catalogue.</b></p>
        <p class="muted">L’école n’en a pas encore créé.</p>
      </div>
    } @else {
      <div class="grid grid-2">
        @for (r of rows(); track r.course.id) {
          <article class="card course-card" [attr.data-course]="r.course.id">
            <header>
              <span class="pill">Cours n° {{ r.course.id }}</span>
              <span class="pill">{{ level(r.course.difficulty) }}</span>
            </header>
            <h3>{{ r.course.title }}</h3>
            <p class="muted">{{ r.course.description }}</p>
            <span class="pill" [class.pill-ok]="r.status !== 'a-suivre'">
              @switch (r.status) {
                @case ('badge') { Terminé, badge délivré ✓ }
                @case ('termine') { Terminé, badge en attente }
                @default { À suivre }
              }
            </span>
          </article>
        }
      </div>
    }
  `,
})
export class EleveCoursesPage implements OnInit {
  private readonly backend = inject(BackendService);

  protected readonly courses = signal<Course[]>([]);
  protected readonly me = signal<MeResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly rows = computed(() => {
    const m = this.me();
    const completed = new Set((m?.user.completedCourses ?? []).map((c) => c.id));
    const badged = new Set([...(m?.badges ?? []), ...(m?.nftBadges ?? [])].map((b) => b.courseId));
    return this.courses().map((course) => ({
      course,
      status: (badged.has(course.id) ? 'badge' : completed.has(course.id) ? 'termine' : 'a-suivre') as Status,
    }));
  });

  async ngOnInit(): Promise<void> {
    const [courses, me] = await Promise.all([this.backend.courses(), this.backend.me()]);
    this.loading.set(false);
    if (courses.ok && me.ok) {
      this.courses.set(courses.data.courses);
      this.me.set(me.data);
    } else {
      this.error.set((courses.ok ? me.data['message'] : courses.data['message']) ?? 'Impossible de charger les cours.');
    }
  }

  protected level(difficulty: Course['difficulty']): string {
    return LEVELS[difficulty] ?? difficulty;
  }
}
