import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BackendService, CreatedStudentResponse } from '../../core/backend.service';
import { ConfigService } from '../../core/config.service';
import { ToastService } from '../../core/toast.service';
import { ApiResult, Course, StudentRow } from '../../models';
import { CopyButtonComponent } from '../../shared/copy-button.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { short } from '../../util';

type Action = 'complete' | 'badge' | 'nft';

/**
 * Le coeur de l'espace ecole : pour UN cours choisi, ou en est chaque eleve, et les gestes possibles
 * (valider le cours, delivrer le badge du registre, creer le badge NFT).
 */
@Component({
  selector: 'app-ecole-students-page',
  imports: [FormsModule, CopyButtonComponent, IconComponent, ModalComponent],
  template: `
    <header class="page-head head-row">
      <div>
        <h1>Élèves</h1>
        <p class="muted">Choisissez un cours : vous voyez où en est chaque élève et vous pouvez valider son cours, puis lui délivrer son badge.</p>
      </div>
      <button type="button" class="btn btn-primary" id="btnNewStudent" (click)="openCreate()"><app-icon name="plus" /> Nouvel élève</button>
    </header>

    <div class="card toolbar">
      <div class="grow">
        <label for="courseSelect">Cours</label>
        <select id="courseSelect" name="courseSelect" [ngModel]="courseId()" (ngModelChange)="courseId.set($event)">
          @for (c of courses(); track c.id) {
            <option [ngValue]="c.id">N° {{ c.id }} · {{ c.title }}</option>
          }
        </select>
      </div>
      <div class="grow">
        <label for="search">Rechercher un élève</label>
        <input id="search" name="search" type="search" placeholder="Pseudo, e-mail ou adresse" [ngModel]="query()" (ngModelChange)="query.set($event)">
      </div>
    </div>

    @if (error()) {
      <div class="alert alert-err" role="alert"><app-icon name="alert" /><span>{{ error() }}</span></div>
    }
    @if (busy()) {
      <div class="alert alert-info" role="status" id="busyNotice"><span class="spin"></span>
        <span>Une écriture est en cours sur la blockchain : comptez une dizaine de secondes. Les autres boutons attendent la fin pour ne pas se marcher dessus.</span></div>
    }

    @if (loading()) {
      <p class="muted"><span class="spin"></span> Chargement…</p>
    } @else if (!courses().length) {
      <div class="card empty-state">
        <app-icon name="book" [size]="32" />
        <p><b>Aucun cours.</b></p>
        <p class="muted">Créez d’abord un cours dans l’onglet « Cours ».</p>
      </div>
    } @else if (!students().length) {
      <div class="card empty-state">
        <app-icon name="users" [size]="32" />
        <p><b>Aucun élève inscrit.</b></p>
        <p class="muted">Les élèves peuvent créer eux-mêmes leur compte depuis la page d’inscription, ou vous pouvez le faire avec « Nouvel élève ».</p>
      </div>
    } @else {
      <div class="card">
        <div class="table-wrap">
          <table class="table" id="studentsTable">
            <thead>
              <tr><th scope="col">Élève</th><th scope="col">Portefeuille</th><th scope="col">Cours n° {{ courseId() }}</th><th scope="col"><span class="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.student.id) {
                <tr [attr.data-student]="row.student.email">
                  <td>
                    <b>{{ row.student.username }}</b>
                    <small class="cell-sub">{{ row.student.email }}</small>
                    @if (!row.student.hasPassword) { <span class="pill pill-warn">sans mot de passe</span> }
                    @if (row.student.mustChangePassword) { <span class="pill pill-warn" data-flag="temporary">mot de passe temporaire</span> }
                  </td>
                  <td>
                    <span class="mono">{{ short(row.student.walletAddress) }}</span>
                    <app-copy-button [text]="row.student.walletAddress" label="Copier" />
                  </td>
                  <td>
                    <div class="status-cell">
                      <span class="pill" [class.pill-ok]="row.completed">{{ row.completed ? 'Cours terminé' : 'Non terminé' }}</span>
                      @if (row.badge) { <span class="pill pill-ok">Badge ✓</span> }
                      @if (row.nft) { <span class="pill pill-ok">NFT ✓</span> }
                    </div>
                  </td>
                  <td class="actions-cell">
                    @if (!row.completed) {
                      <button type="button" class="btn btn-secondary btn-sm" data-action="complete" [disabled]="busy()" (click)="act(row.student, 'complete')">Valider le cours</button>
                    } @else {
                      @if (!row.badge) {
                        <button type="button" class="btn btn-primary btn-sm" data-action="badge" [disabled]="busy()" (click)="act(row.student, 'badge')">
                          @if (isBusy(row.student, 'badge')) { <span class="spin"></span> } Délivrer le badge
                        </button>
                      }
                      @if (!row.nft && nftAvailable()) {
                        <button type="button" class="btn btn-secondary btn-sm" data-action="nft" [disabled]="busy()" (click)="act(row.student, 'nft')">
                          @if (isBusy(row.student, 'nft')) { <span class="spin"></span> } Créer le NFT
                        </button>
                      }
                    }
                    <button type="button" class="btn btn-ghost btn-sm" data-action="reset" [disabled]="busy()" (click)="askReset(row.student)">Mot de passe</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="muted">Aucun élève ne correspond à « {{ query() }} ».</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <app-modal [open]="creating()" label="Nouvel élève" (closed)="closeCreate()">
      @if (!created()) {
        <h2>Nouvel élève</h2>
        <p>Le serveur crée son <b>portefeuille Ethereum</b> et un <b>mot de passe temporaire</b>. Aucun e-mail n’est envoyé : vous les remettez vous-même à l’élève, qui choisira son propre mot de passe à sa première connexion.</p>
        <form (ngSubmit)="createStudent()" novalidate>
          <label for="newUsername">Pseudo</label>
          <input id="newUsername" name="newUsername" autocomplete="off" maxlength="40" [ngModel]="newUsername()" (ngModelChange)="newUsername.set($event)">
          <label for="newEmail">E-mail</label>
          <input id="newEmail" name="newEmail" type="email" autocomplete="off" inputmode="email" maxlength="120" [ngModel]="newEmail()" (ngModelChange)="newEmail.set($event)">
          @if (createError()) {
            <div class="alert alert-err" role="alert" id="createError"><app-icon name="alert" /><span>{{ createError() }}</span></div>
          }
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="closeCreate()">Annuler</button>
            <button type="submit" class="btn btn-primary" id="btnCreateStudent" [disabled]="createBusy()">
              @if (createBusy()) { <span class="spin"></span> } Créer le compte
            </button>
          </div>
        </form>
      } @else {
        @let result = created()!;
        <h2>Compte créé pour {{ result.user.username }}</h2>
        <div class="alert alert-warn"><app-icon name="alert" /><span>Notez ces informations maintenant : elles ne seront plus jamais affichées.</span></div>

        <label>Connexion de l’élève</label>
        <div class="hash-box">
          <span class="hash-label">E-mail</span>
          <span class="mono" id="createdEmail">{{ result.user.email }}</span>
          <span class="hash-label">Mot de passe temporaire</span>
          <span class="mono" id="createdPassword">{{ result.temporaryPassword }}</span>
          <app-copy-button [text]="loginText(result)" label="Copier e-mail et mot de passe" buttonId="copyLogin" />
        </div>
        <p class="field-hint"><span>À sa première connexion, l’élève devra remplacer ce mot de passe par le sien.</span></p>

        <label>Clé privée de son portefeuille</label>
        <div class="hash-box">
          <span class="mono" id="createdKey">{{ showKey() ? result.privateKey : '••••••••••••••••••••••••••••••••' }}</span>
          <span class="inline-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="btnShowKey" [attr.aria-pressed]="showKey()" (click)="showKey.set(!showKey())">
              <app-icon name="eye" [size]="16" /> {{ showKey() ? 'Masquer' : 'Afficher' }}
            </button>
            <app-copy-button [text]="result.privateKey" label="Copier la clé" buttonId="copyKey" />
          </span>
        </div>
        <p class="field-hint">Elle sert à contrôler son portefeuille (badges NFT), pas à se connecter. Ne la gardez pas : remettez-la à l’élève, puis fermez cette fenêtre. Le serveur ne la conserve pas.</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-primary" id="btnCloseCreated" (click)="closeCreate()">J’ai noté ces informations</button>
        </div>
      }
    </app-modal>

    <app-modal [open]="resetFor() !== null" label="Réinitialiser un mot de passe" (closed)="closeReset()">
      @if (resetFor(); as student) {
        <h2>Mot de passe de {{ student.username }}</h2>
        @if (!tempPassword()) {
          <p>Un mot de passe temporaire va être généré. <b>L’ancien ne fonctionnera plus.</b> Vous le communiquerez à l’élève. À sa première connexion, il devra <b>choisir son propre mot de passe</b> avant de pouvoir utiliser son espace.</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="closeReset()">Annuler</button>
            <button type="button" class="btn btn-primary" id="btnConfirmReset" [disabled]="resetBusy()" (click)="confirmReset(student)">
              @if (resetBusy()) { <span class="spin"></span> } Générer le mot de passe
            </button>
          </div>
        } @else {
          <div class="alert alert-warn"><app-icon name="alert" /><span>Notez-le maintenant : il ne sera plus jamais affiché.</span></div>
          <div class="hash-box">
            <span class="mono" id="tempPassword">{{ tempPassword() }}</span>
            <app-copy-button [text]="tempPassword()" label="Copier" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-primary" id="btnCloseReset" (click)="closeReset()">J’ai noté le mot de passe</button>
          </div>
        }
      }
    </app-modal>
  `,
})
export class EcoleStudentsPage implements OnInit {
  private readonly backend = inject(BackendService);
  private readonly config = inject(ConfigService);
  private readonly toasts = inject(ToastService);

  protected readonly students = signal<StudentRow[]>([]);
  protected readonly courses = signal<Course[]>([]);
  protected readonly courseId = signal<number | null>(null);
  protected readonly query = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  /** "<id de l'eleve>:<geste>" tant qu'une ecriture est en cours. Une seule a la fois : voir act(). */
  protected readonly busy = signal<string | null>(null);
  protected readonly short = short;

  protected readonly resetFor = signal<StudentRow | null>(null);
  protected readonly tempPassword = signal('');
  protected readonly resetBusy = signal(false);

  protected readonly creating = signal(false);
  protected readonly newUsername = signal('');
  protected readonly newEmail = signal('');
  protected readonly createBusy = signal(false);
  protected readonly createError = signal('');
  /** Le compte qui vient d'etre cree, avec son temporaire et sa cle : en memoire seulement, le temps de les noter. */
  protected readonly created = signal<CreatedStudentResponse | null>(null);
  protected readonly showKey = signal(false);

  protected readonly nftAvailable = computed(() => !!this.config.nftAddress());

  protected readonly rows = computed(() => {
    const id = this.courseId();
    const needle = this.query().trim().toLowerCase();
    return this.students()
      .filter((s) => !needle || [s.username, s.email, s.walletAddress].some((v) => v.toLowerCase().includes(needle)))
      .map((s) => ({
        student: s,
        completed: id !== null && s.completedCourseIds.includes(id),
        badge: id !== null && s.badgeCourseIds.includes(id),
        nft: id !== null && s.nftCourseIds.includes(id),
      }));
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadCourses(), this.loadStudents()]);
    this.loading.set(false);
  }

  private async loadCourses(): Promise<void> {
    const result = await this.backend.courses();
    if (result.ok) {
      this.courses.set(result.data.courses);
      if (this.courseId() === null && result.data.courses.length) {
        this.courseId.set(result.data.courses[0].id);
      }
    } else {
      this.error.set(result.data['message'] ?? 'Impossible de charger les cours.');
    }
  }

  private async loadStudents(): Promise<void> {
    const result = await this.backend.students();
    if (result.ok) {
      this.students.set(result.data.students);
    } else {
      this.error.set(result.data['message'] ?? 'Impossible de charger les élèves.');
    }
  }

  protected isBusy(student: StudentRow, action: Action): boolean {
    return this.busy() === `${student.id}:${action}`;
  }

  /**
   * Une seule ecriture a la fois : l'ecole signe toutes les transactions avec le meme portefeuille, et deux envois
   * simultanes se disputeraient le meme numero de transaction (nonce) sur la blockchain.
   */
  protected async act(student: StudentRow, action: Action): Promise<void> {
    const course = this.courses().find((c) => c.id === this.courseId());
    if (!course || this.busy()) {
      return;
    }
    this.busy.set(`${student.id}:${action}`);
    this.error.set('');
    let result: ApiResult;
    if (action === 'complete') {
      result = await this.backend.completeCourse(course.id, student.email);
    } else if (action === 'badge') {
      result = await this.backend.issueBadge(student.email, course.id);
    } else {
      result = await this.backend.issueNft(student.email, course.id);
    }
    this.busy.set(null);

    if (!result.ok) {
      this.toasts.error(this.explain(result));
      return;
    }
    const tx = result.data['links']?.transaction as string | undefined;
    const done = action === 'complete'
      ? `Cours validé pour ${student.username}.`
      : action === 'badge' ? `Badge délivré à ${student.username}.` : `Badge NFT créé pour ${student.username}.`;
    this.toasts.success(done, tx, tx ? 'Voir la transaction' : undefined);
    await this.loadStudents();
  }

  /** Le message du serveur, avec une explication quand le refus vient du contrat ou du reseau. */
  private explain(result: ApiResult): string {
    const message = result.data['message'] ?? 'Action impossible.';
    if (result.status === 409) {
      return `${message} (rien n’a été envoyé sur la blockchain)`;
    }
    if (result.status === 422) {
      return `Refusé par le smart contract : ${message}`;
    }
    return message;
  }

  protected openCreate(): void {
    this.newUsername.set('');
    this.newEmail.set('');
    this.createError.set('');
    this.created.set(null);
    this.showKey.set(false);
    this.creating.set(true);
  }

  /** Ferme la fenetre et efface de la memoire de la page le mot de passe temporaire et la cle privee. */
  protected closeCreate(): void {
    this.creating.set(false);
    this.created.set(null);
    this.showKey.set(false);
  }

  /** Ce que l'ecole recopie pour l'eleve : jamais la cle privee, qui a sa propre case. */
  protected loginText(result: CreatedStudentResponse): string {
    return `E-mail : ${result.user.email}\nMot de passe temporaire : ${result.temporaryPassword}`;
  }

  protected async createStudent(): Promise<void> {
    const username = this.newUsername().trim();
    const email = this.newEmail().trim();
    if (username.length < 3 || username.length > 40) {
      this.createError.set('Le pseudo doit faire entre 3 et 40 caractères.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.createError.set('Saisissez une adresse e-mail valide.');
      return;
    }
    this.createError.set('');
    this.createBusy.set(true);
    const result = await this.backend.createStudent(username, email);
    this.createBusy.set(false);
    if (!result.ok) {
      this.createError.set(result.status === 409 ? 'Ce pseudo ou cet e-mail est déjà utilisé.' : (result.data['message'] ?? 'Création impossible.'));
      return;
    }
    this.created.set(result.data);
    this.toasts.success(`Compte créé pour ${result.data.user.username}.`);
    await this.loadStudents();
  }

  protected askReset(student: StudentRow): void {
    this.tempPassword.set('');
    this.resetFor.set(student);
  }

  protected closeReset(): void {
    this.resetFor.set(null);
    // le mot de passe temporaire disparait de la memoire de la page des que la fenetre se ferme
    this.tempPassword.set('');
  }

  protected async confirmReset(student: StudentRow): Promise<void> {
    this.resetBusy.set(true);
    const result = await this.backend.resetPassword(student.id);
    this.resetBusy.set(false);
    if (result.ok) {
      this.tempPassword.set(result.data.temporaryPassword);
      await this.loadStudents();
    } else {
      this.closeReset();
      this.toasts.error(result.data['message'] ?? 'Réinitialisation impossible.');
    }
  }
}
