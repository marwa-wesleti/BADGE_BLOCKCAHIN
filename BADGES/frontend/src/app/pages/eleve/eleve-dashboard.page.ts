import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BackendService, MeResponse } from '../../core/backend.service';
import { ConfigService } from '../../core/config.service';
import { CopyButtonComponent } from '../../shared/copy-button.component';
import { IconComponent } from '../../shared/icon.component';
import { formatDate, short, verificationLink } from '../../util';

@Component({
  selector: 'app-eleve-dashboard-page',
  imports: [RouterLink, CopyButtonComponent, IconComponent],
  template: `
    @if (loading()) {
      <p class="muted"><span class="spin"></span> Chargement de votre espace…</p>
    } @else {
    @if (me(); as m) {
      <header class="page-head">
        <h1>Bonjour {{ m.user.username }}</h1>
        <p class="muted">Voici vos badges. Chacun est écrit sur la blockchain : n’importe qui peut le vérifier, sans passer par l’école.</p>
      </header>

      <section class="grid grid-3" aria-label="Vos chiffres">
        <article class="card stat"><app-icon name="book" [size]="24" /><span class="stat-num" id="statCourses">{{ cards().length }}</span><span class="stat-label">Cours terminés</span></article>
        <article class="card stat"><app-icon name="award" [size]="24" /><span class="stat-num" id="statBadges">{{ m.badges.length }}</span><span class="stat-label">Badges du registre</span></article>
        <article class="card stat"><app-icon name="shield" [size]="24" /><span class="stat-num" id="statNft">{{ m.nftBadges.length }}</span><span class="stat-label">Badges NFT</span></article>
      </section>

      <section class="card" aria-labelledby="titre-portefeuille">
        <h2 id="titre-portefeuille"><app-icon name="wallet" /> Mon portefeuille</h2>
        <p class="muted">Cette adresse publique vous identifie sur la blockchain : vos badges y sont rattachés. Elle peut être partagée.</p>
        <div class="hash-box">
          <span class="mono" id="myWallet">{{ m.user.walletAddress }}</span>
          <span class="inline-actions">
            <app-copy-button [text]="m.user.walletAddress" label="Copier l’adresse" buttonId="copyWallet" />
            @if (config.addressUrl(m.user.walletAddress); as url) {
              <a class="btn btn-ghost btn-sm" [href]="url" target="_blank" rel="noopener">Etherscan <app-icon name="external" [size]="14" /></a>
            }
          </span>
        </div>
      </section>

      <h2 class="section-title">Mes badges</h2>
      @if (!cards().length) {
        <div class="card empty-state" id="noBadges">
          <app-icon name="award" [size]="32" />
          <p><b>Vous n’avez pas encore terminé de cours.</b></p>
          <p class="muted">Quand l’école validera un cours, il apparaîtra ici, puis son badge une fois délivré.</p>
          <a class="btn btn-secondary btn-sm" routerLink="/eleve/cours">Voir les cours</a>
        </div>
      } @else {
        <div class="grid grid-2">
          @for (c of cards(); track c.course.id) {
            <article class="card badge-card" [attr.data-course]="c.course.id">
              <header>
                <span class="pill">Cours n° {{ c.course.id }}</span>
                <h3>{{ c.course.title }}</h3>
              </header>

              @if (!c.badge && !c.nft) {
                <div class="alert alert-info"><app-icon name="clock" />
                  <span>Cours terminé. L’école n’a pas encore délivré de badge pour ce cours.</span></div>
              }

              @if (c.badge; as b) {
                <div class="proof">
                  <span class="pill pill-ok">Badge du registre ✓</span>
                  <p class="muted">Délivré le {{ formatDate(b.blockTime) }}, bloc {{ b.blockNumber }}.</p>
                  <div class="inline-actions">
                    <a class="btn btn-ghost btn-sm" routerLink="/verifier" [queryParams]="{ type: 'registre', adresse: m.user.walletAddress, cours: c.course.id }">Vérifier publiquement</a>
                    @if (config.txUrl(b.txHash); as url) {
                      <a class="btn btn-ghost btn-sm" [href]="url" target="_blank" rel="noopener">Transaction <app-icon name="external" [size]="14" /></a>
                    }
                    <app-copy-button [text]="link('registre', m.user.walletAddress, c.course.id)" label="Copier le lien" />
                  </div>
                </div>
              }

              @if (c.nft; as n) {
                <div class="proof">
                  <span class="pill pill-ok">Badge NFT n° {{ n.tokenId }} ✓</span>
                  <p class="muted">Jeton que vous possédez, non transférable. Délivré le {{ formatDate(n.blockTime) }}.</p>
                  <div class="inline-actions">
                    <a class="btn btn-ghost btn-sm" routerLink="/verifier" [queryParams]="{ type: 'nft', adresse: m.user.walletAddress, cours: c.course.id }">Vérifier publiquement</a>
                    @if (config.tokenUrl(n.contractAddress, n.tokenId); as url) {
                      <a class="btn btn-ghost btn-sm" [href]="url" target="_blank" rel="noopener">Jeton <app-icon name="external" [size]="14" /></a>
                    }
                    <app-copy-button [text]="link('nft', m.user.walletAddress, c.course.id)" label="Copier le lien" />
                  </div>
                </div>
              }
            </article>
          }
        </div>
      }
    } @else {
      <div class="alert alert-err" role="alert"><app-icon name="alert" /><span>{{ error() }}</span></div>
    }
    }
  `,
})
export class EleveDashboardPage implements OnInit {
  private readonly backend = inject(BackendService);
  protected readonly config = inject(ConfigService);

  protected readonly me = signal<MeResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly formatDate = formatDate;
  protected readonly short = short;

  /** Un bloc par cours termine, avec son badge du registre et son badge NFT s'ils existent. */
  protected readonly cards = computed(() => {
    const m = this.me();
    if (!m) {
      return [];
    }
    return (m.user.completedCourses ?? []).map((course) => ({
      course,
      badge: m.badges.find((b) => b.courseId === course.id) ?? null,
      nft: m.nftBadges.find((b) => b.courseId === course.id) ?? null,
    }));
  });

  async ngOnInit(): Promise<void> {
    const result = await this.backend.me();
    this.loading.set(false);
    if (result.ok) {
      this.me.set(result.data);
    } else {
      this.error.set(result.data['message'] ?? 'Impossible de charger votre espace.');
    }
  }

  protected link(type: 'registre' | 'nft', wallet: string, courseId: number): string {
    return verificationLink(type, wallet, courseId);
  }
}
