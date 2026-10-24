import { Routes } from '@angular/router';
import { guestGuard, passwordGuard, roleGuard } from './core/guards';

const SITE = 'Badges blockchain';

/**
 * Trois zones : le site public (verification ouverte a tous), l'espace ecole et l'espace eleve.
 * Les gardes redirigent par confort ; le vrai controle des droits est fait par le serveur (401 et 403).
 * Chaque page est chargee a la demande : on ne telecharge que ce qu'on visite.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layouts/public-layout.component').then((m) => m.PublicLayoutComponent),
    children: [
      { path: '', title: SITE, loadComponent: () => import('./pages/public/home.page').then((m) => m.HomePage) },
      { path: 'connexion', title: `Connexion · ${SITE}`, canActivate: [guestGuard], loadComponent: () => import('./pages/public/login.page').then((m) => m.LoginPage) },
      { path: 'inscription', title: `Inscription · ${SITE}`, canActivate: [guestGuard], loadComponent: () => import('./pages/public/register.page').then((m) => m.RegisterPage) },
      { path: 'mot-de-passe', title: `Mot de passe · ${SITE}`, canActivate: [passwordGuard], loadComponent: () => import('./pages/eleve/change-password.page').then((m) => m.ChangePasswordPage) },
      { path: 'verifier', title: `Vérifier · ${SITE}`, loadComponent: () => import('./pages/public/verify.page').then((m) => m.VerifyPage) },
    ],
  },
  {
    path: 'ecole',
    canActivate: [roleGuard('ECOLE')],
    loadComponent: () => import('./layouts/ecole-layout.component').then((m) => m.EcoleLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },
      { path: 'tableau-de-bord', title: `Tableau de bord · École · ${SITE}`, loadComponent: () => import('./pages/ecole/ecole-dashboard.page').then((m) => m.EcoleDashboardPage) },
      { path: 'cours', title: `Cours · École · ${SITE}`, loadComponent: () => import('./pages/ecole/ecole-courses.page').then((m) => m.EcoleCoursesPage) },
      { path: 'eleves', title: `Élèves · École · ${SITE}`, loadComponent: () => import('./pages/ecole/ecole-students.page').then((m) => m.EcoleStudentsPage) },
      { path: 'documents', title: `Documents · École · ${SITE}`, loadComponent: () => import('./pages/ecole/ecole-documents.page').then((m) => m.EcoleDocumentsPage) },
    ],
  },
  {
    path: 'eleve',
    canActivate: [roleGuard('ELEVE')],
    loadComponent: () => import('./layouts/eleve-layout.component').then((m) => m.EleveLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'mon-espace' },
      { path: 'mon-espace', title: `Mon espace · ${SITE}`, loadComponent: () => import('./pages/eleve/eleve-dashboard.page').then((m) => m.EleveDashboardPage) },
      { path: 'cours', title: `Cours · ${SITE}`, loadComponent: () => import('./pages/eleve/eleve-courses.page').then((m) => m.EleveCoursesPage) },
      { path: 'documents', title: `Mes documents · ${SITE}`, loadComponent: () => import('./pages/eleve/eleve-documents.page').then((m) => m.EleveDocumentsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
