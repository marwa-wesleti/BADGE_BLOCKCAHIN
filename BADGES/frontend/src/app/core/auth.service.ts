import { HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { SILENT_401 } from './http-context';
import { ToastService } from './toast.service';
import { TokenStore } from './token.store';
import { ApiBody, ApiResult, User } from '../models';

/** La page ou l'eleve choisit son mot de passe (obligatoire apres une reinitialisation par l'ecole). */
export const PASSWORD_URL = '/mot-de-passe';

interface LoginResponse extends ApiBody {
  token: string;
  user: User;
}

export interface RegisterResponse extends LoginResponse {
  privateKey: string;
}

/** Qui est connecte : connexion, inscription, deconnexion, et restauration de la session apres un rechargement. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokens = inject(TokenStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly user = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly role = computed(() => this.user()?.role ?? null);
  /** Mot de passe temporaire : tant qu'il n'est pas remplace, le serveur refuse tout le reste. */
  readonly mustChangePassword = computed(() => this.user()?.mustChangePassword === true);
  /** La page d'accueil de chaque profil : l'espace ecole, l'espace eleve, ou l'accueil public (ou le changement de mot de passe, s'il est obligatoire). */
  readonly homeUrl = computed(() => this.mustChangePassword() ? PASSWORD_URL : this.role() === 'ECOLE' ? '/ecole' : this.role() === 'ELEVE' ? '/eleve' : '/');

  private restoring: Promise<void> | null = null;

  /** Se resout quand on sait si quelqu'un est connecte (une seule restauration par chargement de page). */
  ready(): Promise<void> {
    return (this.restoring ??= this.restore());
  }

  private async restore(): Promise<void> {
    if (!this.tokens.token()) {
      return;
    }
    // silencieux : un jeton perime est simplement oublie ; le message "session expiree" est reserve a un usage en cours
    const result = await this.api.call<{ user: User }>('GET', '/api/me', undefined, new HttpContext().set(SILENT_401, true));
    if (result.ok) {
      this.user.set(result.data.user);
    } else {
      this.tokens.set(null);
    }
  }

  async login(email: string, password: string): Promise<ApiResult<LoginResponse>> {
    const result = await this.api.call<LoginResponse>('POST', '/api/auth/login', { email, password });
    if (result.ok) {
      this.startSession(result.data);
    }
    return result;
  }

  async register(username: string, email: string, password: string): Promise<ApiResult<RegisterResponse>> {
    const result = await this.api.call<RegisterResponse>('POST', '/api/auth/register', { username, email, password });
    if (result.ok) {
      this.startSession(result.data);
    }
    return result;
  }

  /** Choisit un nouveau mot de passe ; le serveur redemande l'actuel (le temporaire, apres une reinitialisation). */
  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResult<{ user: User }>> {
    const result = await this.api.call<{ user: User }>('POST', '/api/auth/change-password', { currentPassword, newPassword });
    if (result.ok) {
      this.user.set(result.data.user);
    }
    return result;
  }

  /**
   * Le serveur a refuse une action parce que le mot de passe est temporaire (l'ecole vient peut-etre de le reinitialiser
   * alors que la personne etait deja connectee) : on renvoie vers la page de changement, avec une explication.
   */
  requirePasswordChange(): void {
    const user = this.user();
    if (user && !user.mustChangePassword) {
      this.user.set({ ...user, mustChangePassword: true });
      this.toasts.warn('L’école a réinitialisé votre mot de passe : choisissez-en un nouveau pour continuer.');
    }
    if (this.router.url !== PASSWORD_URL) {
      void this.router.navigateByUrl(PASSWORD_URL);
    }
  }

  private startSession(data: LoginResponse): void {
    this.tokens.set(data.token);
    this.user.set(data.user);
    this.restoring = Promise.resolve();
  }

  logout(): void {
    this.tokens.set(null);
    this.user.set(null);
    void this.router.navigateByUrl('/');
  }

  /** Le jeton n'est plus valide (expire, ou compte supprime) : retour a la connexion, avec une explication. */
  expire(): void {
    if (!this.tokens.token() && !this.user()) {
      return;
    }
    this.tokens.set(null);
    this.user.set(null);
    this.toasts.warn('Votre session a expiré : reconnectez-vous.');
    void this.router.navigateByUrl('/connexion');
  }
}
