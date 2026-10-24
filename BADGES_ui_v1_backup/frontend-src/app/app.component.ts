import { Component, OnInit, computed, inject } from '@angular/core';
import { ApiService } from './api.service';
import { JournalComponent } from './journal.component';
import { AppConfig } from './models';
import { SessionService } from './session.service';
import { BadgeStepComponent } from './steps/badge-step.component';
import { CourseStepComponent } from './steps/course-step.component';
import { NftStepComponent } from './steps/nft-step.component';
import { ProofStepComponent } from './steps/proof-step.component';
import { RegisterStepComponent } from './steps/register-step.component';
import { short } from './util';

@Component({
  selector: 'app-root',
  imports: [RegisterStepComponent, CourseStepComponent, BadgeStepComponent, ProofStepComponent, NftStepComponent, JournalComponent],
  template: `
    <div class="wrap">
      <header>
        <h1>Badges de réussite sur blockchain</h1>
        <p>Chaque étape appelle l'API du serveur ; les règles sont appliquées par un smart contract Solidity.</p>
        <div class="pills" id="pills" aria-live="polite">
          @if (session.config(); as config) {
            <span class="pill"><span class="dot"></span><b>{{ config.network }}</b></span>
            <span class="pill">
              Contrat
              @if (config.contractAddress) {
                @if (contractUrl(); as url) {
                  <a [href]="url" target="_blank" rel="noopener" class="mono">{{ shortContract() }} ↗</a>
                } @else {
                  <span class="mono">{{ shortContract() }}</span>
                }
              } @else {
                <b>non déployé</b>
              }
            </span>
            @if (config.nftContractAddress) {
              <span class="pill">
                Contrat NFT
                @if (nftUrl(); as url) {
                  <a [href]="url" target="_blank" rel="noopener" class="mono">{{ shortNft() }} ↗</a>
                } @else {
                  <span class="mono">{{ shortNft() }}</span>
                }
              </span>
            }
          } @else {
            <span class="pill">{{ configFailed ? 'Configuration indisponible' : 'Chargement de la configuration…' }}</span>
          }
        </div>
      </header>

      <div class="layout">
        <main>
          <app-register-step />
          <app-course-step />
          <app-badge-step />
          <app-proof-step />
          <app-nft-step />
        </main>
        <aside>
          <app-journal />
        </aside>
      </div>

      <footer>Réseau de test : l'ETH n'a aucune valeur. Tout ce qui est écrit sur la blockchain est public et définitif.</footer>
    </div>
  `,
})
export class AppComponent implements OnInit {
  protected readonly session = inject(SessionService);
  private readonly api = inject(ApiService);

  protected configFailed = false;
  protected readonly contractUrl = computed(() => this.session.explorerUrl('address', this.session.config()?.contractAddress));
  protected readonly shortContract = computed(() => short(this.session.config()?.contractAddress));
  protected readonly nftUrl = computed(() => this.session.explorerUrl('address', this.session.config()?.nftContractAddress));
  protected readonly shortNft = computed(() => short(this.session.config()?.nftContractAddress));

  async ngOnInit(): Promise<void> {
    const result = await this.api.call<AppConfig>('GET', '/api/config');
    if (result.ok) {
      this.session.config.set(result.data);
    } else {
      this.configFailed = true;
    }
  }
}
