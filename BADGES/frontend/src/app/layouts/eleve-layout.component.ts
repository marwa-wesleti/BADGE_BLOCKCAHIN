import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { IconComponent } from '../shared/icon.component';

/** L'espace de l'eleve : un bandeau simple en haut, ses badges et le catalogue de cours. */
@Component({
  selector: 'app-eleve-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <a class="skip-link" href="#contenu">Aller au contenu</a>
    <header class="site-header">
      <div class="container header-row">
        <a routerLink="/eleve" class="brand"><app-icon name="shield" [size]="26" /><span>Badges blockchain</span></a>
        <nav class="nav" aria-label="Navigation de l’espace élève">
          <a routerLink="/eleve/mon-espace" routerLinkActive="active"><app-icon name="award" [size]="18" /> Mon espace</a>
          <a routerLink="/eleve/cours" routerLinkActive="active"><app-icon name="book" [size]="18" /> Cours</a>
          <a routerLink="/eleve/documents" routerLinkActive="active"><app-icon name="file" [size]="18" /> Documents</a>
          <a routerLink="/verifier" routerLinkActive="active"><app-icon name="search" [size]="18" /> Vérifier</a>
        </nav>
        <div class="header-actions">
          @if (auth.user(); as user) {
            <span class="user-chip"><span class="avatar" aria-hidden="true">{{ user.username.charAt(0).toUpperCase() }}</span> {{ user.username }}</span>
          }
          <a routerLink="/mot-de-passe" class="btn btn-ghost btn-sm" id="linkPassword"><app-icon name="lock" [size]="18" /> Mot de passe</a>
          <button type="button" class="btn btn-ghost btn-sm" id="btnLogout" (click)="auth.logout()"><app-icon name="logout" [size]="18" /> Se déconnecter</button>
        </div>
      </div>
    </header>
    <main id="contenu" class="container page" tabindex="-1">
      <router-outlet />
    </main>
  `,
})
export class EleveLayoutComponent {
  protected readonly auth = inject(AuthService);
}
