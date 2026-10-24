import { Component, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionRunner } from '../action-runner.service';
import { ApiBody, Fact, Verdict } from '../models';
import { SessionService } from '../session.service';
import { formatDate, short } from '../util';

interface IssueNftResponse extends ApiBody {
  badge: { course: string; tokenId: number; contractAddress: string; txHash: string; blockNumber: number; blockTime: string };
}

interface VerifyNftResponse extends ApiBody {
  valid: boolean;
  onChain: { tokenId: number | null; owner: string | null; issuedAt: string | null };
  database: { user: string; course: string } | null;
}

@Component({
  selector: 'app-nft-step',
  imports: [FormsModule],
  host: {
    class: 'step',
    id: 'step5',
    '[class.done]': 'session.done().nft',
    // Variante facultative : mise en avant seulement quand les 4 premieres etapes sont terminees
    '[class.active]': 'session.activeStep() === -1 && !session.done().nft',
  },
  template: `
    <h2><span class="num">{{ session.done().nft ? '✓' : 5 }}</span> Badge NFT (jeton non transférable)</h2>
    <p class="hint">
      Variante du badge : le contrat NFT crée un <b>jeton numéroté</b> dont l'élève devient propriétaire. Il ne peut jamais être vendu ni transféré.
    </p>
    <div class="body">
      <div class="actions">
        <button class="primary" id="btnNft" [disabled]="busy()" (click)="issue()">Créer le badge NFT</button>
      </div>
      <p class="hint" style="margin: 6px 0 0">
        Utilise l'e-mail de l'étape 1 et le cours de l'étape 2. Compter une dizaine de secondes sur Sepolia. Un 2<sup>e</sup> clic doit être refusé.
      </p>

      <label for="nftWallet">Adresse du portefeuille de l'élève (remplie automatiquement)</label>
      <input id="nftWallet" class="mono" autocomplete="off" spellcheck="false" [(ngModel)]="wallet">
      <div class="actions">
        <button id="btnVerifyNft" [disabled]="busy()" (click)="verify()">Vérifier le jeton dans le contrat</button>
      </div>

      <div id="nftVerdict" aria-live="polite">
        @if (verdict(); as v) {
          <div class="verdict" [class.ok]="v.ok" [class.ko]="!v.ok">
            {{ v.title }}
            <small>{{ v.detail }}</small>
          </div>
        }
      </div>
    </div>
  `,
})
export class NftStepComponent {
  protected readonly session = inject(SessionService);
  private readonly runner = inject(ActionRunner);

  /** Se remplit tout seul a l'inscription, mais reste modifiable pour verifier le jeton de quelqu'un d'autre. */
  protected readonly wallet = linkedSignal(() => this.session.wallet());
  protected readonly busy = signal(false);
  protected readonly verdict = signal<Verdict | null>(null);

  protected async issue(): Promise<void> {
    this.busy.set(true);
    const result = await this.runner.run<IssueNftResponse>(
      'Création du badge NFT',
      'POST',
      '/api/nft-badges/issue',
      { email: this.session.email(), courseId: this.session.courseId() },
      (d) => {
        const facts: Fact[] = [
          { label: 'Cours', text: d.badge.course },
          { label: 'Jeton n°', text: String(d.badge.tokenId), href: this.session.explorerNftUrl(d.badge.contractAddress, d.badge.tokenId) },
          ...this.session.txFacts(d.badge),
        ];
        return facts;
      },
    );
    this.busy.set(false);
    if (result.ok) {
      this.session.markDone('nft');
    }
  }

  protected async verify(): Promise<void> {
    this.busy.set(true);
    const url = `/api/nft-badges/verify/${encodeURIComponent(this.wallet().trim())}/${encodeURIComponent(this.session.courseId())}`;
    const result = await this.runner.run<VerifyNftResponse>('Vérification du badge NFT', 'GET', url, undefined, (d) => [
      ...(d.onChain?.tokenId != null ? [{ label: 'Jeton n°', text: String(d.onChain.tokenId) }] : []),
      ...(d.onChain?.owner ? [{ label: 'Propriétaire', text: short(d.onChain.owner) }] : []),
      { label: 'Délivré le', text: formatDate(d.onChain?.issuedAt) },
      ...(d.database ? [{ label: 'Élève', text: d.database.user }, { label: 'Cours', text: d.database.course }] : []),
    ]);
    this.busy.set(false);

    if (result.ok && result.data.valid) {
      const onChain = result.data.onChain;
      this.verdict.set({
        ok: true,
        title: 'Badge NFT authentique ✓',
        detail: `Le jeton n° ${onChain.tokenId} appartient à ${short(onChain.owner)}, délivré le ${formatDate(onChain.issuedAt)}.`,
      });
    } else if (result.ok) {
      this.verdict.set({
        ok: false,
        title: 'Aucun badge NFT trouvé ✗',
        detail: 'Le contrat NFT ne connaît aucun jeton pour cette adresse et ce cours.',
      });
    } else {
      this.verdict.set({ ok: false, title: 'Vérification impossible', detail: result.data['message'] ?? 'Erreur' });
    }
  }
}
