import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { JournalService } from '../core/journal.service';
import { IconComponent } from '../shared/icon.component';
import { JournalComponent } from '../shared/journal.component';

/** L'espace de l'ecole : menu a gauche, page au centre, journal des echanges (avec les liens blockchain) a droite. */
@Component({
  selector: 'app-ecole-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, JournalComponent],
  template: `
    <a class="skip-link" href="#contenu">Aller au contenu</a>
    <div class="app-shell">
      <aside class="sidebar" [class.open]="menuOpen()" aria-label="Menu de l’espace école">
        <a routerLink="/ecole" class="brand brand-inverse"><app-icon name="shield" [size]="26" /><span>Badges blockchain</span></a>
        <span class="role-tag">Espace école</span>
        <nav class="side-nav" (click)="menuOpen.set(false)">
          <a routerLink="/ecole/tableau-de-bord" routerLinkActive="active"><app-icon name="layout" /> Tableau de bord</a>
          <a routerLink="/ecole/cours" routerLinkActive="active"><app-icon name="book" /> Cours</a>
          <a routerLink="/ecole/eleves" routerLinkActive="active"><app-icon name="users" /> Élèves</a>
          <a routerLink="/ecole/documents" routerLinkActive="active"><app-icon name="file" /> Documents</a>
          <a routerLink="/verifier"><app-icon name="search" /> Vérification publique</a>
        </nav>
        <div class="sidebar-foot">
          @if (auth.user(); as user) {
            <div class="user-card">
              <span class="avatar" aria-hidden="true">{{ user.username.charAt(0).toUpperCase() }}</span>
              <span class="user-meta"><b>{{ user.username }}</b><small>{{ user.email }}</small></span>
            </div>
          }
          <button type="button" class="btn btn-ghost-inverse btn-block" id="btnLogout" (click)="auth.logout()">
            <app-icon name="logout" /> Se déconnecter
          </button>
        </div>
      </aside>

      <div class="app-main">
        <header class="topbar">
          <button type="button" class="btn btn-ghost btn-sm menu-btn" aria-label="Ouvrir le menu" (click)="menuOpen.set(!menuOpen())">
            <app-icon name="menu" />
          </button>
          <span class="topbar-title">Espace école</span>
          <button type="button" class="btn btn-ghost btn-sm" id="btnJournal" [attr.aria-expanded]="journalOpen()" (click)="journalOpen.set(!journalOpen())">
            <app-icon name="list" /> Journal
            @if (journal.entries().length) { <span class="count">{{ journal.entries().length }}</span> }
          </button>
        </header>
        <main id="contenu" class="page" tabindex="-1">
          <router-outlet />
        </main>
      </div>

      @if (journalOpen()) {
        <aside class="drawer" aria-label="Journal des échanges">
          <button type="button" class="btn btn-ghost btn-sm drawer-close" aria-label="Fermer le journal" (click)="journalOpen.set(false)">
            <app-icon name="x" />
          </button>
          <app-journal />
        </aside>
      }
    </div>
  `,
})
export class EcoleLayoutComponent {
  protected readonly auth = inject(AuthService);
  protected readonly journal = inject(JournalService);
  protected readonly menuOpen = signal(false);
  protected readonly journalOpen = signal(false);
}
