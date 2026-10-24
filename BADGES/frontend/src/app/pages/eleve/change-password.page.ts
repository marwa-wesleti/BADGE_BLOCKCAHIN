import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';

const MIN_LENGTH = 8;
/** BCrypt ne lit que les 72 premiers octets : le serveur refuse plus long, on le dit avant d'envoyer. */
const MAX_BYTES = 72;

/**
 * Choisir son mot de passe. Obligatoire apres une reinitialisation par l'ecole (le mot de passe actuel est alors le
 * temporaire qu'elle a communique) ; facultatif sinon, depuis le menu de l'espace eleve.
 */
@Component({
  selector: 'app-change-password-page',
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <section class="auth-card card">
      <h1>{{ forced ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe' }}</h1>

      @if (forced) {
        <div class="alert alert-info" id="forcedNotice" role="status">
          <app-icon name="lock" />
          <span>Votre mot de passe actuel est <b>temporaire</b> : c’est l’école qui l’a généré. Choisissez-en un que vous seul connaissez. Vous ne pourrez pas utiliser votre espace avant de l’avoir fait.</span>
        </div>
      } @else {
        <p class="muted">Pour votre sécurité, l’ancien mot de passe est redemandé.</p>
      }

      <form (ngSubmit)="submit()" novalidate>
        <label for="current">{{ forced ? 'Mot de passe temporaire (donné par l’école)' : 'Mot de passe actuel' }}</label>
        <input id="current" name="current" [type]="show() ? 'text' : 'password'" autocomplete="current-password" [(ngModel)]="current">

        <label for="next">Nouveau mot de passe</label>
        <div class="input-with-action">
          <input id="next" name="next" [type]="show() ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="next">
          <button type="button" class="btn btn-ghost btn-sm" id="btnShow" [attr.aria-pressed]="show()" (click)="show.set(!show())">
            <app-icon name="eye" [size]="18" /> {{ show() ? 'Masquer' : 'Afficher' }}
          </button>
        </div>
        <p class="field-hint">8 caractères minimum, différent du mot de passe actuel.</p>

        <label for="confirm">Confirmer le nouveau mot de passe</label>
        <input id="confirm" name="confirm" [type]="show() ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="confirm">

        @if (error()) {
          <div class="alert alert-err" role="alert" id="changeError"><app-icon name="alert" /><span>{{ error() }}</span></div>
        }

        <div class="inline-actions">
          <button type="submit" class="btn btn-primary" id="btnChange" [disabled]="busy()">
            @if (busy()) { <span class="spin"></span> Enregistrement… } @else { Enregistrer mon mot de passe }
          </button>
          @if (!forced) {
            <a routerLink="/eleve" class="btn btn-ghost" id="btnCancel">Annuler</a>
          }
        </div>
      </form>
    </section>
  `,
})
export class ChangePasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  /** Fixe a l'ouverture : la page ne change pas de visage quand l'enregistrement reussit, juste avant la redirection. */
  protected readonly forced = this.auth.mustChangePassword();

  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly confirm = signal('');
  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    this.error.set('');
    const problem = this.validate();
    if (problem) {
      this.error.set(problem);
      return;
    }

    this.busy.set(true);
    const result = await this.auth.changePassword(this.current(), this.next());
    this.busy.set(false);

    if (!result.ok) {
      this.error.set(
        result.status === 0 ? 'Le serveur ne répond pas : est-il démarré ?'
          : result.status === 401 ? (this.forced ? 'Le mot de passe temporaire est incorrect.' : 'Le mot de passe actuel est incorrect.')
          : result.status === 429 ? 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'
          : (result.data['message'] ?? 'Le mot de passe n’a pas pu être changé.'),
      );
      if (result.status === 401) {
        this.current.set('');
      }
      return;
    }
    this.toasts.success('Votre mot de passe a été changé.');
    await this.router.navigateByUrl('/eleve');
  }

  /** Ce que le serveur refuserait aussi : on le dit tout de suite, sans aller-retour. */
  private validate(): string {
    if (!this.current()) {
      return this.forced ? 'Saisissez le mot de passe temporaire donné par l’école.' : 'Saisissez votre mot de passe actuel.';
    }
    if (this.next().length < MIN_LENGTH) {
      return `Le nouveau mot de passe doit faire ${MIN_LENGTH} caractères au minimum.`;
    }
    if (new TextEncoder().encode(this.next()).length > MAX_BYTES) {
      return 'Le nouveau mot de passe est trop long.';
    }
    if (this.next() === this.current()) {
      return 'Le nouveau mot de passe doit être différent de l’actuel.';
    }
    if (this.next() !== this.confirm()) {
      return 'Les deux mots de passe ne correspondent pas.';
    }
    return '';
  }
}
