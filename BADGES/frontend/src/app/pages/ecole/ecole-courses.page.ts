import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BackendService } from '../../core/backend.service';
import { ToastService } from '../../core/toast.service';
import { Course } from '../../models';
import { IconComponent } from '../../shared/icon.component';

const LEVELS: Record<Course['difficulty'], string> = { Beginner: 'Débutant', Intermediate: 'Intermédiaire', Advanced: 'Avancé' };

@Component({
  selector: 'app-ecole-courses-page',
  imports: [FormsModule, IconComponent],
  template: `
    <header class="page-head">
      <h1>Cours</h1>
      <p class="muted">Les cours restent dans la base de données de l’école : ils n’apparaissent sur la blockchain que par leur numéro, dans un badge.</p>
    </header>

    <div class="grid grid-sidebar">
      <section class="card" aria-labelledby="titre-liste">
        <h2 id="titre-liste">Catalogue ({{ courses().length }})</h2>
        @if (loading()) {
          <p class="muted"><span class="spin"></span> Chargement…</p>
        } @else if (!courses().length) {
          <div class="empty-state">
            <app-icon name="book" [size]="32" />
            <p><b>Aucun cours pour l’instant.</b></p>
            <p class="muted">Créez le premier avec le formulaire.</p>
          </div>
        } @else {
          <div class="table-wrap">
            <table class="table" id="coursesTable">
              <thead><tr><th scope="col">N°</th><th scope="col">Titre</th><th scope="col">Niveau</th></tr></thead>
              <tbody>
                @for (c of courses(); track c.id) {
                  <tr>
                    <td><span class="pill">{{ c.id }}</span></td>
                    <td><b>{{ c.title }}</b><small class="cell-sub">{{ c.description }}</small></td>
                    <td><span class="pill">{{ level(c.difficulty) }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <section class="card" aria-labelledby="titre-nouveau">
        <h2 id="titre-nouveau">Nouveau cours</h2>
        <form (ngSubmit)="create()" novalidate>
          <label for="title">Titre</label>
          <input id="title" name="title" maxlength="100" [(ngModel)]="title" required placeholder="Introduction à la blockchain">
          <p class="field-hint">Il est écrit dans les badges, donc publiquement et pour toujours : un titre sans donnée personnelle.</p>

          <label for="description">Description</label>
          <textarea id="description" name="description" rows="3" maxlength="1000" [(ngModel)]="description" required></textarea>

          <label for="difficulty">Niveau</label>
          <select id="difficulty" name="difficulty" [(ngModel)]="difficulty">
            <option value="Beginner">Débutant</option>
            <option value="Intermediate">Intermédiaire</option>
            <option value="Advanced">Avancé</option>
          </select>

          @if (error()) {
            <div class="alert alert-err" role="alert"><app-icon name="alert" /><span>{{ error() }}</span></div>
          }
          <button type="submit" class="btn btn-primary btn-block" id="btnCreateCourse" [disabled]="busy()">
            @if (busy()) { <span class="spin"></span> Création… } @else { <app-icon name="plus" /> Créer le cours }
          </button>
        </form>
      </section>
    </div>
  `,
})
export class EcoleCoursesPage implements OnInit {
  private readonly backend = inject(BackendService);
  private readonly toasts = inject(ToastService);

  protected readonly courses = signal<Course[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly difficulty = signal<Course['difficulty']>('Beginner');

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected level(difficulty: Course['difficulty']): string {
    return LEVELS[difficulty] ?? difficulty;
  }

  private async load(): Promise<void> {
    const result = await this.backend.courses();
    this.loading.set(false);
    if (result.ok) {
      this.courses.set(result.data.courses);
    } else {
      this.error.set(result.data['message'] ?? 'Impossible de charger les cours.');
    }
  }

  protected async create(): Promise<void> {
    this.error.set('');
    if (!this.title().trim() || !this.description().trim()) {
      this.error.set('Le titre et la description sont obligatoires.');
      return;
    }
    this.busy.set(true);
    const result = await this.backend.createCourse(this.title().trim(), this.description().trim(), this.difficulty());
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(result.data['message'] ?? 'Création impossible.');
      return;
    }
    this.toasts.success(`Cours « ${result.data.course.title} » créé (n° ${result.data.course.id}).`);
    this.title.set('');
    this.description.set('');
    this.difficulty.set('Beginner');
    await this.load();
  }
}
