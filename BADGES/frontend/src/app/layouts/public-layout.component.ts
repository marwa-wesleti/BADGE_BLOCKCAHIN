import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ConfigService } from '../core/config.service';
import { IconComponent } from '../shared/icon.component';
import { short } from '../util';

/** Le site public : accueil, verification, connexion et inscription. */
@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <a class="skip-link" href="#contenu">Aller au contenu</a>
    <header class="site-header">
      <div class="container header-row">
        <a routerLink="/" class="brand"><app-icon name="shield" [size]="26" /><span>Badges blockchain</span></a>
        <nav class="nav" aria-label="Navigation principale">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Accueil</a>
          <a routerLink="/verifier" routerLinkActive="active">Vérifier</a>
        </nav>
        <div class="header-actions">
          @if (auth.user(); as user) {
            <a class="btn btn-primary btn-sm" [routerLink]="auth.homeUrl()" id="linkEspace">Mon espace</a>
            <button type="button" class="btn btn-ghost btn-sm" (click)="auth.logout()">Se déconnecter</button>
          } @else {
            <a routerLink="/connexion" class="btn btn-ghost btn-sm" id="linkConnexion">Connexion</a>
            <a routerLink="/inscription" class="btn btn-primary btn-sm" id="linkInscription">Créer un compte</a>
          }
        </div>
      </div>
    </header>

    <main id="contenu" class="container page" tabindex="-1">
      <router-outlet />
    </main>

    <footer class="site-footer">
      <div class="container footer-row">
        <p>Réseau de test : l’ETH n’a aucune valeur. Tout ce qui est écrit sur la blockchain est public et définitif.</p>
        <div class="pills">
          @if (config.config(); as c) {
            <span class="pill"><span class="dot"></span><b>{{ c.network }}</b></span>
            @if (config.addressUrl(c.contractAddress); as url) {
              <a class="pill" [href]="url" target="_blank" rel="noopener">Registre <span class="mono">{{ short(c.contractAddress) }}</span> <app-icon name="external" [size]="13" /></a>
            }
            @if (config.addressUrl(c.nftContractAddress); as url) {
              <a class="pill" [href]="url" target="_blank" rel="noopener">NFT <span class="mono">{{ short(c.nftContractAddress) }}</span> <app-icon name="external" [size]="13" /></a>
            }
          } @else if (config.failed()) {
            <span class="pill pill-warn">Serveur injoignable</span>
          }
        </div>
      </div>
    </footer>
  `,
})
export class PublicLayoutComponent {
  protected readonly auth = inject(AuthService);
  protected readonly config = inject(ConfigService);
  protected readonly short = short;
}
