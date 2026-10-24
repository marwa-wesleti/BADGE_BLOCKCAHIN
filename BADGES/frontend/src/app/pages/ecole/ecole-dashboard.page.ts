import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BackendService } from '../../core/backend.service';
import { ConfigService } from '../../core/config.service';
import { Overview } from '../../models';
import { CopyButtonComponent } from '../../shared/copy-button.component';
import { IconComponent } from '../../shared/icon.component';
import { formatEth, short } from '../../util';

/** En dessous, l'ecole risque de ne plus pouvoir payer le gas d'une ecriture (un badge coute des fractions de microETH). */
const LOW_BALANCE_ETH = 0.01;

@Component({
  selector: 'app-ecole-dashboard-page',
  imports: [RouterLink, CopyButtonComponent, IconComponent],
  template: `
    <header class="page-head">
      <h1>Tableau de bord</h1>
      <p class="muted">Vue d’ensemble de l’école : élèves, cours et badges écrits sur la blockchain.</p>
    </header>

    @if (error()) {
      <div class="alert alert-err" role="alert"><app-icon name="alert" /><span>{{ error() }}</span></div>
    }

    <section class="grid grid-4" aria-label="Chiffres clés">
      <article class="card stat"><app-icon name="users" [size]="24" /><span class="stat-num" id="statStudents">{{ overview()?.students ?? '–' }}</span><span class="stat-label">Élèves</span></article>
      <article class="card stat"><app-icon name="book" [size]="24" /><span class="stat-num" id="statCourses">{{ overview()?.courses ?? '–' }}</span><span class="stat-label">Cours</span></article>
      <article class="card stat"><app-icon name="award" [size]="24" /><span class="stat-num" id="statBadges">{{ overview()?.badges ?? '–' }}</span><span class="stat-label">Badges du registre</span></article>
      <article class="card stat"><app-icon name="shield" [size]="24" /><span class="stat-num" id="statNft">{{ overview()?.nftBadges ?? '–' }}</span><span class="stat-label">Badges NFT</span></article>
    </section>

    <div class="grid grid-2">
      <section class="card" aria-labelledby="titre-portefeuille">
        <h2 id="titre-portefeuille">Portefeuille de l’école</h2>
        <p class="muted">Il signe et paie chaque écriture sur la blockchain. L’élève ne paie jamais rien.</p>
        @if (walletLoading()) {
          <p class="muted"><span class="spin"></span> Lecture du solde sur le réseau…</p>
        } @else {
          @if (wallet(); as w) {
            <div class="hash-box">
              <span class="hash-label">Adresse publique</span>
              <span class="mono" id="schoolAddress">{{ w.address }}</span>
              <span class="inline-actions">
                <app-copy-button [text]="w.address" label="Copier" />
                @if (config.addressUrl(w.address); as url) {
                  <a class="btn btn-ghost btn-sm" [href]="url" target="_blank" rel="noopener">Etherscan <app-icon name="external" [size]="14" /></a>
                }
              </span>
            </div>
            <p class="balance" id="schoolBalance"><span class="muted">Solde</span>&ngsp;<b>{{ formatEth(w.balanceEth) }}</b>&ngsp;<span class="muted">(monnaie de test)</span></p>
            @if (low()) {
              <div class="alert alert-warn" role="alert"><app-icon name="alert" />
                <span>Solde bas : sans ETH de test, plus aucun badge ne peut être écrit. Rechargez l’adresse ci-dessus avec un faucet Sepolia.</span></div>
            }
          } @else {
            <div class="alert alert-warn"><app-icon name="alert" /><span>{{ walletError() }}</span></div>
          }
        }
        <button type="button" class="btn btn-ghost btn-sm" id="btnRefreshWallet" [disabled]="walletLoading()" (click)="loadWallet()"><app-icon name="refresh" [size]="16" /> Actualiser</button>
      </section>

      <section class="card" aria-labelledby="titre-contrats">
        <h2 id="titre-contrats">Contrats sur la blockchain</h2>
        <p class="muted">Ils sont publics : n’importe qui peut les consulter sur {{ config.network() || 'le réseau' }}.</p>
        <ul class="link-list">
          <li>
            <span><b>Registre</b><small>Badges et empreintes de documents</small></span>
            @if (config.registryAddress(); as a) {
              <a [href]="config.addressUrl(a)" target="_blank" rel="noopener" class="mono">{{ short(a) }} <app-icon name="external" [size]="14" /></a>
            } @else { <span class="pill pill-warn">non déployé</span> }
          </li>
          <li>
            <span><b>NFT</b><small>Badges sous forme de jetons non transférables</small></span>
            @if (config.nftAddress(); as a) {
              <a [href]="config.addressUrl(a)" target="_blank" rel="noopener" class="mono">{{ short(a) }} <app-icon name="external" [size]="14" /></a>
            } @else { <span class="pill pill-warn">non déployé</span> }
          </li>
        </ul>
      </section>
    </div>

    <section class="card" aria-labelledby="titre-etapes">
      <h2 id="titre-etapes">Pour délivrer un premier badge</h2>
      <ol class="checklist">
        @for (s of steps(); track s.label) {
          <li [class.done]="s.done">
            <span class="check-mark" aria-hidden="true">@if (s.done) { <app-icon name="check" [size]="16" /> }</span>
            <span class="check-text">
              <b>{{ s.label }}</b>
              <small>{{ s.hint }}</small>
            </span>
            @if (s.link) { <a class="btn btn-ghost btn-sm" [routerLink]="s.link">Ouvrir</a> }
          </li>
        }
      </ol>
    </section>
  `,
})
export class EcoleDashboardPage implements OnInit {
  private readonly backend = inject(BackendService);
  protected readonly config = inject(ConfigService);

  protected readonly overview = signal<Overview | null>(null);
  protected readonly error = signal('');
  protected readonly wallet = signal<{ address: string; balanceEth: string } | null>(null);
  protected readonly walletLoading = signal(true);
  protected readonly walletError = signal('');
  protected readonly short = short;
  protected readonly formatEth = formatEth;

  protected readonly low = computed(() => {
    const w = this.wallet();
    return w !== null && Number(w.balanceEth) < LOW_BALANCE_ETH;
  });

  protected readonly steps = computed(() => {
    const o = this.overview();
    return [
      { label: 'Créer un cours', hint: 'Un cours est ce que l’élève doit terminer.', done: (o?.courses ?? 0) > 0, link: '/ecole/cours' },
      { label: 'Attendre l’inscription d’un élève', hint: 'Les élèves créent eux-mêmes leur compte depuis la page d’inscription.', done: (o?.students ?? 0) > 0, link: '' },
      { label: 'Valider le cours d’un élève', hint: 'Seul un élève dont le cours est validé peut recevoir un badge.', done: (o?.completions ?? 0) > 0, link: '/ecole/eleves' },
      { label: 'Délivrer un badge', hint: 'Une écriture signée par l’école, publique et définitive.', done: (o?.badges ?? 0) + (o?.nftBadges ?? 0) > 0, link: '/ecole/eleves' },
    ];
  });

  async ngOnInit(): Promise<void> {
    // les deux appels partent ensemble : le solde interroge le reseau et peut etre plus lent
    await Promise.all([this.loadOverview(), this.loadWallet()]);
  }

  private async loadOverview(): Promise<void> {
    const result = await this.backend.overview();
    if (result.ok) {
      this.overview.set(result.data);
    } else {
      this.error.set(result.data['message'] ?? 'Impossible de charger le tableau de bord.');
    }
  }

  protected async loadWallet(): Promise<void> {
    this.walletLoading.set(true);
    const result = await this.backend.wallet();
    this.walletLoading.set(false);
    if (result.ok) {
      this.wallet.set(result.data);
      this.walletError.set('');
    } else {
      this.wallet.set(null);
      this.walletError.set(result.data['message'] ?? 'Solde indisponible.');
    }
  }
}
