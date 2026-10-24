import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionRunner } from '../action-runner.service';
import { ApiBody } from '../models';
import { SessionService } from '../session.service';

interface CourseResponse extends ApiBody {
  course: { id: number; title: string };
}

@Component({
  selector: 'app-course-step',
  imports: [FormsModule],
  host: {
    class: 'step',
    id: 'step2',
    '[class.done]': 'session.done().complete',
    '[class.active]': 'session.activeStep() === 1',
  },
  template: `
    <h2><span class="num">{{ session.done().complete ? '✓' : 2 }}</span> Cours</h2>
    <p class="hint">Cette étape reste dans la base de données : aucune blockchain.</p>
    <div class="body">
      <label for="courseTitle">Titre du cours</label>
      <input id="courseTitle" [(ngModel)]="title" autocomplete="off">
      <div class="actions">
        <button class="primary" id="btnCourse" [disabled]="busy()" (click)="create()">Créer le cours</button>
      </div>
      <div class="row">
        <div>
          <label for="courseId">Numéro du cours (rempli automatiquement)</label>
          <input id="courseId" inputmode="numeric" [(ngModel)]="session.courseId">
        </div>
      </div>
      <div class="actions">
        <button id="btnComplete" [disabled]="busy()" (click)="complete()">Marquer le cours comme terminé</button>
      </div>
    </div>
  `,
})
export class CourseStepComponent {
  protected readonly session = inject(SessionService);
  private readonly runner = inject(ActionRunner);

  protected readonly title = signal('Introduction à la blockchain');
  protected readonly busy = signal(false);

  protected async create(): Promise<void> {
    this.busy.set(true);
    const result = await this.runner.run<CourseResponse>(
      'Création du cours',
      'POST',
      '/api/courses',
      { title: this.title(), description: 'Cours de démonstration' },
      (d) => [
        { label: 'Numéro', text: String(d.course.id) },
        { label: 'Titre', text: d.course.title },
      ],
    );
    this.busy.set(false);
    if (result.ok) {
      this.session.courseId.set(String(result.data.course.id));
    }
  }

  protected async complete(): Promise<void> {
    this.busy.set(true);
    const result = await this.runner.run(
      'Cours terminé',
      'POST',
      `/api/courses/${encodeURIComponent(this.session.courseId())}/complete`,
      { email: this.session.email() },
    );
    this.busy.set(false);
    if (result.ok) {
      this.session.markDone('complete');
    }
  }
}
