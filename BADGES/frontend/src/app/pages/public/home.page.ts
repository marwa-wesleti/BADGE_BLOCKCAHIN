import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, IconComponent],
  template: `
    <section class="hero">
      <p class="eyebrow">Projet Blockchain · Ethereum Sepolia</p>
      <h1>Des badges de réussite que personne ne peut falsifier</h1>
      <p class="lead">
        Quand un élève termine un cours, l’école écrit son badge dans un smart contract. Le badge devient public, daté par le réseau,
        et n’importe qui peut le vérifier sans demander à l’école.
      </p>
      <div class="hero-actions">
        @if (auth.user()) {
          <a class="btn btn-primary" [routerLink]="auth.homeUrl()" id="ctaEspace">Accéder à mon espace</a>
        } @else {
          <a class="btn btn-primary" routerLink="/connexion" id="ctaConnexion">Se connecter</a>
          <a class="btn btn-secondary" routerLink="/inscription" id="ctaInscription">Créer un compte élève</a>
        }
        <a class="btn btn-ghost" routerLink="/verifier" id="ctaVerifier"><app-icon name="search" /> Vérifier un badge</a>
      </div>
    </section>

    <section aria-labelledby="titre-etapes">
      <h2 id="titre-etapes" class="section-title">Comment ça marche</h2>
      <ol class="steps">
        <li class="card step-card">
          <span class="step-num">1</span>
          <h3>L’école valide le cours</h3>
          <p>Elle indique qu’un élève a terminé un cours. Cette information reste dans la base de données de l’école.</p>
        </li>
        <li class="card step-card">
          <span class="step-num">2</span>
          <h3>Le contrat écrit le badge</h3>
          <p>L’école signe une transaction. Le contrat contrôle les règles, puis enregistre le badge avec la date du bloc.</p>
        </li>
        <li class="card step-card">
          <span class="step-num">3</span>
          <h3>Tout le monde vérifie</h3>
          <p>Avec l’adresse de l’élève et le numéro du cours, n’importe qui interroge le contrat. C’est gratuit et sans compte.</p>
        </li>
      </ol>
    </section>

    <section aria-labelledby="titre-roles">
      <h2 id="titre-roles" class="section-title">Qui peut faire quoi</h2>
      <div class="grid grid-3">
        <article class="card role-card">
          <app-icon name="shield" [size]="28" />
          <h3>L’école</h3>
          <ul>
            <li>Crée les cours</li>
            <li>Valide les cours des élèves</li>
            <li>Délivre les badges : registre ou NFT</li>
            <li>Grave l’empreinte d’un document</li>
          </ul>
        </article>
        <article class="card role-card">
          <app-icon name="award" [size]="28" />
          <h3>L’élève</h3>
          <ul>
            <li>S’inscrit et reçoit son portefeuille</li>
            <li>Consulte ses badges et ses cours</li>
            <li>Partage un lien de vérification</li>
            <li>Ne paie jamais rien</li>
          </ul>
        </article>
        <article class="card role-card">
          <app-icon name="search" [size]="28" />
          <h3>Tout le monde</h3>
          <ul>
            <li>Vérifie un badge, sans compte</li>
            <li>Vérifie un badge NFT</li>
            <li>Vérifie un document par son empreinte</li>
            <li>Lit la blockchain directement</li>
          </ul>
        </article>
      </div>
    </section>

    <section aria-labelledby="titre-garanties">
      <h2 id="titre-garanties" class="section-title">Ce que la blockchain garantit ici</h2>
      <div class="grid grid-2">
        <div class="card"><h3>Les règles sont dans le contrat</h3><p>Seule l’école écrit, un badge ne se délivre qu’une fois par cours, un NFT ne se transfère pas. Le serveur ne peut pas contourner ces règles.</p></div>
        <div class="card"><h3>Aucune donnée personnelle publique</h3><p>La blockchain ne contient que des adresses, des numéros de cours et des empreintes. Les noms et e-mails restent dans la base.</p></div>
        <div class="card"><h3>Le document ne quitte pas votre ordinateur</h3><p>Pour prouver un document, son empreinte est calculée dans votre navigateur. Seule l’empreinte est envoyée.</p></div>
        <div class="card">
          <h3>Vérifiable par tous</h3>
          <p>Les contrats sont publics sur Sepolia.
            @if (config.addressUrl(config.registryAddress()); as url) {
              <a [href]="url" target="_blank" rel="noopener">Voir le registre <app-icon name="external" [size]="14" /></a>
            }
            @if (config.addressUrl(config.nftAddress()); as url) {
              · <a [href]="url" target="_blank" rel="noopener">Voir le NFT <app-icon name="external" [size]="14" /></a>
            }
          </p>
        </div>
      </div>
    </section>
  `,
})
export class HomePage {
  protected readonly auth = inject(AuthService);
  protected readonly config = inject(ConfigService);
}
