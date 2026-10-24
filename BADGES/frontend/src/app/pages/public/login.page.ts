import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, PASSWORD_URL } from '../../core/auth.service';
import { safeReturnUrl } from '../../core/guards';
import { ToastService } from '../../core/toast.service';
import { Role } from '../../models';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <section class="auth-card card">
      <h1>Connexion</h1>
      <p class="muted">Choisissez votre profil, puis connectez-vous avec votre e-mail.</p>

      <div class="tabs tabs-full" role="tablist" aria-label="Profil">
        <button type="button" role="tab" id="tabEleve" [class.active]="profile() === 'ELEVE'" [attr.aria-selected]="profile() === 'ELEVE'"
                (click)="profile.set('ELEVE')"><app-icon name="award" [size]="18" /> Élève</button>
        <button type="button" role="tab" id="tabEcole" [class.active]="profile() === 'ECOLE'" [attr.aria-selected]="profile() === 'ECOLE'"
                (click)="profile.set('ECOLE')"><app-icon name="shield" [size]="18" /> École</button>
      </div>

      <form (ngSubmit)="submit()" novalidate>
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="username" inputmode="email" [(ngModel)]="email" required>

        <label for="password">Mot de passe</label>
        <div class="input-with-action">
          <input id="password" name="password" [type]="show() ? 'text' : 'password'" autocomplete="current-password" [(ngModel)]="password" required>
          <button type="button" class="btn btn-ghost btn-sm" id="btnShow" [attr.aria-pressed]="show()" (click)="show.set(!show())">
            <app-icon name="eye" [size]="18" /> {{ show() ? 'Masquer' : 'Afficher' }}
          </button>
        </div>

        @if (error()) {
          <div class="alert alert-err" role="alert" id="loginError"><app-icon name="alert" /><span>{{ error() }}</span></div>
        }

        <button type="submit" class="btn btn-primary btn-block" id="btnLogin" [disabled]="busy()">
          @if (busy()) { <span class="spin"></span> Connexion… } @else { Se connecter }
        </button>
      </form>

      @if (profile() === 'ELEVE') {
        <p class="auth-foot">Pas encore de compte ? <a routerLink="/inscription">Créer un compte élève</a></p>
        <p class="field-hint">Ancien compte sans mot de passe ? Demandez à l’école de le réinitialiser.</p>
      } @else {
        <p class="field-hint">Le compte de l’école est créé par l’administrateur du serveur, avec les réglages ECOLE_EMAIL et ECOLE_PASSWORD. Il n’existe pas d’inscription école.</p>
      }
    </section>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);

  protected readonly profile = signal<Role>('ELEVE');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    this.error.set('');
    if (!this.email().trim() || !this.password()) {
      this.error.set('Saisissez votre e-mail et votre mot de passe.');
      return;
    }
    this.busy.set(true);
    const result = await this.auth.login(this.email().trim(), this.password());
    this.busy.set(false);

    if (!result.ok) {
      this.error.set(
        result.status === 0 ? 'Le serveur ne répond pas : est-il démarré ?'
          : result.status === 429 ? 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'
          : result.status === 401 ? 'E-mail ou mot de passe incorrect.'
          : (result.data['message'] ?? 'Connexion impossible.'),
      );
      this.password.set('');
      return;
    }

    const role = result.data.user.role;
    if (role !== this.profile()) {
      // on suit le vrai profil du compte, mais on le dit : sinon la personne ne comprend pas ou elle atterrit
      this.toasts.info(role === 'ECOLE' ? 'Ce compte est un compte école : voici votre espace école.' : 'Ce compte est un compte élève : voici votre espace élève.');
    }
    if (result.data.user.mustChangePassword) {
      // mot de passe temporaire donne par l'ecole : il faut en choisir un avant toute autre chose
      this.toasts.info('Votre mot de passe est temporaire : choisissez le vôtre pour continuer.');
      await this.router.navigateByUrl(PASSWORD_URL);
      return;
    }
    const back = safeReturnUrl(this.route.snapshot.queryParamMap.get('retour'), role);
    await this.router.navigateByUrl(back ?? (role === 'ECOLE' ? '/ecole' : '/eleve'));
  }
}
