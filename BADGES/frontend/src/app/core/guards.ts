import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, PASSWORD_URL } from './auth.service';
import { Role } from '../models';

/**
 * Reserve une zone a un profil. Pas connecte : retour a la connexion (on retient la page voulue).
 * Mauvais profil : renvoye vers son propre espace. Le vrai controle est fait par le serveur (403) : ceci n'est que du confort.
 */
export const roleGuard = (role: Role): CanActivateFn => async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  const user = auth.user();
  if (!user) {
    return router.createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
  }
  if (user.mustChangePassword) {
    return router.parseUrl(PASSWORD_URL); // mot de passe temporaire : rien d'autre n'est accessible avant de l'avoir change
  }
  return user.role === role ? true : router.parseUrl(auth.homeUrl());
};

/** La page de changement de mot de passe : reservee aux eleves connectes (le mot de passe de l'ecole se change dans .env). */
export const passwordGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  const user = auth.user();
  if (!user) {
    return router.createUrlTree(['/connexion']);
  }
  return user.role === 'ELEVE' ? true : router.parseUrl(auth.homeUrl());
};

/** Connexion et inscription n'ont pas de sens pour quelqu'un deja connecte : on l'envoie dans son espace. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  return auth.user() ? router.parseUrl(auth.homeUrl()) : true;
};

/**
 * La page ou revenir apres la connexion. Uniquement un chemin interne de l'application : sinon quelqu'un
 * pourrait envoyer un lien de connexion qui renvoie vers un autre site (redirection ouverte).
 */
export function safeReturnUrl(candidate: string | null | undefined, role: Role): string | null {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return null;
  }
  const zone = role === 'ECOLE' ? '/ecole' : '/eleve';
  return candidate === zone || candidate.startsWith(zone + '/') ? candidate : null;
}
