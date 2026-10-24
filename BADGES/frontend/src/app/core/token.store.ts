import { Injectable, signal } from '@angular/core';

const KEY = 'badges.token';

/**
 * Garde le jeton de connexion. sessionStorage : la session survit a un rechargement de la page mais pas a la
 * fermeture de l'onglet. Toutes les lectures et ecritures sont protegees : le stockage peut etre bloque
 * (navigation privee, politique du navigateur) et l'application doit alors fonctionner quand meme, sans memoire.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly current = signal<string | null>(this.read());
  readonly token = this.current.asReadonly();

  set(token: string | null): void {
    this.current.set(token);
    try {
      if (token) {
        sessionStorage.setItem(KEY, token);
      } else {
        sessionStorage.removeItem(KEY);
      }
    } catch {
      // stockage indisponible : le jeton reste en memoire pour cette page
    }
  }

  private read(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  }
}
