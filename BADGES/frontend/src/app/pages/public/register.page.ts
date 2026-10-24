import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { CopyButtonComponent } from '../../shared/copy-button.component';
import { IconComponent } from '../../shared/icon.component';

const HIDDEN_KEY = '••••••••••••••••••••••••••••••••';

/** Inscription d'un eleve. Une fois le compte cree, le portefeuille est montre ici, avec sa cle privee UNE seule fois. */
@Component({
  selector: 'app-register-page',
  imports: [FormsModule, RouterLink, CopyButtonComponent, IconComponent],
  template: `
    @if (phase() === 'form') {
      <section class="auth-card card">
        <h1>Créer un compte élève</h1>
        <p class="muted">Un portefeuille Ethereum est créé pour vous : il identifie vos badges sur la blockchain.</p>

        <form (ngSubmit)="submit()" novalidate>
          <label for="username">Pseudo</label>
          <input id="username" name="username" autocomplete="username" [(ngModel)]="username" required minlength="3" maxlength="40">

          <label for="email">E-mail</label>
          <input id="email" name="email" type="email" autocomplete="email" inputmode="email" [(ngModel)]="email" required>

          <label for="password">Mot de passe</label>
          <input id="password" name="password" type="password" autocomplete="new-password" [(ngModel)]="password" required minlength="8">
          <p class="field-hint" [class.ok]="password().length >= 8">8 caractères minimum.</p>

          <label for="confirm">Confirmer le mot de passe</label>
          <input id="confirm" name="confirm" type="password" autocomplete="new-password" [(ngModel)]="confirm" required>

          @if (error()) {
            <div class="alert alert-err" role="alert" id="registerError"><app-icon name="alert" /><span>{{ error() }}</span></div>
          }

          <button type="submit" class="btn btn-primary btn-block" id="btnRegister" [disabled]="busy()">
            @if (busy()) { <span class="spin"></span> Création… } @else { Créer mon compte }
          </button>
        </form>
        <p class="auth-foot">Déjà inscrit ? <a routerLink="/connexion">Se connecter</a></p>
      </section>
    } @else {
      <section class="auth-card card" aria-live="polite">
        <h1>Votre portefeuille est prêt</h1>
        <p class="muted">Bienvenue {{ username() }}. Notez votre clé privée maintenant : elle ne sera plus jamais affichée.</p>

        <h2 class="mini-title">Adresse publique</h2>
        <div class="hash-box">
          <span class="mono" id="walletView">{{ wallet() }}</span>
          <span class="inline-actions">
            <app-copy-button [text]="wallet()" label="Copier l’adresse" />
            @if (config.addressUrl(wallet()); as url) {
              <a class="btn btn-ghost btn-sm" [href]="url" target="_blank" rel="noopener">Etherscan <app-icon name="external" [size]="14" /></a>
            }
          </span>
        </div>
        <p class="field-hint">Elle peut être partagée : c’est avec elle qu’on vérifie vos badges.</p>

        <h2 class="mini-title">Clé privée</h2>
        <div class="alert alert-warn">
          <app-icon name="alert" />
          <span>Ne la partagez jamais. Le serveur ne la conserve pas : si vous la perdez, elle est perdue. Elle ne sert pas pour utiliser ce site.</span>
        </div>
        <div class="hash-box">
          <span class="mono" id="keyView">{{ keyShown() ? privateKey() : hiddenKey }}</span>
          <span class="inline-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="toggleKey" (click)="keyShown.set(!keyShown())">
              <app-icon name="eye" [size]="18" /> {{ keyShown() ? 'Masquer' : 'Afficher' }}
            </button>
            <app-copy-button [text]="privateKey()" label="Copier la clé" buttonId="copyKey" />
          </span>
        </div>

        <label class="check">
          <input type="checkbox" id="savedKey" name="savedKey" [(ngModel)]="saved">
          <span>J’ai sauvegardé ma clé privée dans un endroit sûr.</span>
        </label>
        <button type="button" class="btn btn-primary btn-block" id="btnContinue" [disabled]="!saved()" (click)="continue()">
          Accéder à mon espace
        </button>
      </section>
    }
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly config = inject(ConfigService);

  protected readonly phase = signal<'form' | 'wallet'>('form');
  protected readonly username = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly wallet = signal('');
  protected readonly privateKey = signal('');
  protected readonly keyShown = signal(false);
  protected readonly saved = signal(false);
  protected readonly hiddenKey = HIDDEN_KEY;

  /** Les verifications simples, faites avant d'envoyer : le serveur refait les memes, c'est lui qui fait foi. */
  protected readonly problem = computed(() => {
    if (this.username().trim().length < 3) {
      return 'Le pseudo doit faire au moins 3 caractères.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim())) {
      return 'Saisissez une adresse e-mail valide.';
    }
    if (this.password().length < 8) {
      return 'Le mot de passe doit faire au moins 8 caractères.';
    }
    if (this.password() !== this.confirm()) {
      return 'Les deux mots de passe ne sont pas identiques.';
    }
    return '';
  });

  protected async submit(): Promise<void> {
    this.error.set('');
    if (this.problem()) {
      this.error.set(this.problem());
      return;
    }
    this.busy.set(true);
    const result = await this.auth.register(this.username().trim(), this.email().trim(), this.password());
    this.busy.set(false);
    if (!result.ok) {
      this.error.set(
        result.status === 0 ? 'Le serveur ne répond pas : est-il démarré ?'
          : result.status === 409 ? 'Ce pseudo ou cet e-mail est déjà utilisé.'
          : (result.data['message'] ?? 'Inscription impossible.'),
      );
      return;
    }
    this.wallet.set(result.data.user.walletAddress);
    this.privateKey.set(result.data.privateKey);
    // le mot de passe ne reste pas en memoire une fois le compte cree
    this.password.set('');
    this.confirm.set('');
    this.phase.set('wallet');
  }

  protected continue(): void {
    // la cle privee disparait de la memoire de la page des qu'on la quitte
    this.privateKey.set('');
    void this.router.navigateByUrl('/eleve');
  }
}
