import { HttpContextToken } from '@angular/common/http';

/**
 * Marque un appel dont un 401 ne doit PAS deconnecter avec le message "session expiree".
 * Sert a la restauration de session au chargement de la page : un jeton perime y est juste oublie, sans bruit,
 * pour qu'un visiteur qui arrive sur l'accueil avec un vieux jeton ne soit pas renvoye vers la connexion.
 */
export const SILENT_401 = new HttpContextToken<boolean>(() => false);
