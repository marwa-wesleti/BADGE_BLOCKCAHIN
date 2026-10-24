import { Component, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionRunner } from '../action-runner.service';
import { ApiBody, Verdict } from '../models';
import { SessionService } from '../session.service';
import { formatDate } from '../util';

interface IssueResponse extends ApiBody {
  badge: { course: string; txHash: string; blockNumber: number; blockTime: string };
}

interface VerifyBadgeResponse extends ApiBody {
  valid: boolean;
  onChain: { issuedAt: string | null };
  database: { user: string; course: string } | null;
}

@Component({
  selector: 'app-badge-step',
  imports: [FormsModule],
  host: {
    class: 'step',
    id: 'step3',
    '[class.done]': 'session.done().issue',
    '[class.active]': 'session.activeStep() === 2',
  },
  template: `
    <h2><span class="num">{{ session.done().issue ? '✓' : 3 }}</span> Badge délivré par le smart contract</h2>
    <p class="hint">L'école signe une transaction ; le contrat refuse les doublons et tout autre appelant.</p>
    <div class="body">
      <div class="actions">
        <button class="primary" id="btnIssue" [disabled]="busy()" (click)="issue()">Délivrer le badge</button>
      </div>
      <p class="hint" style="margin: 6px 0 0">Compter une dizaine de secondes sur Sepolia. Un 2<sup>e</sup> clic doit être refusé.</p>

      <label for="walletInput">Adresse du portefeuille de l'élève (remplie automatiquement)</label>
      <input id="walletInput" class="mono" autocomplete="off" spellcheck="false" [(ngModel)]="wallet">
      <div class="actions">
        <button id="btnVerifyBadge" [disabled]="busy()" (click)="verify()">Vérifier ce badge dans le contrat</button>
      </div>

      <div id="badgeVerdict" aria-live="polite">
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
export class BadgeStepComponent {
  protected readonly session = inject(SessionService);
  private readonly runner = inject(ActionRunner);

  /** Se remplit tout seul a l'inscription, mais reste modifiable pour verifier le badge de quelqu'un d'autre. */
  protected readonly wallet = linkedSignal(() => this.session.wallet());
  protected readonly busy = signal(false);
  protected readonly verdict = signal<Verdict | null>(null);

  protected async issue(): Promise<void> {
    this.busy.set(true);
    const result = await this.runner.run<IssueResponse>(
      'Délivrance du badge',
      'POST',
      '/api/badges/issue',
      { email: this.session.email(), courseId: this.session.courseId() },
      (d) => [{ label: 'Cours', text: d.badge.course }, ...this.session.txFacts(d.badge)],
    );
    this.busy.set(false);
    if (result.ok) {
      this.session.markDone('issue');
    }
  }

  protected async verify(): Promise<void> {
    this.busy.set(true);
    const url = `/api/badges/verify/${encodeURIComponent(this.wallet().trim())}/${encodeURIComponent(this.session.courseId())}`;
    const result = await this.runner.run<VerifyBadgeResponse>('Vérification du badge', 'GET', url, undefined, (d) => [
      { label: 'Délivré le', text: formatDate(d.onChain?.issuedAt) },
      ...(d.database
        ? [{ label: 'Élève', text: d.database.user }, { label: 'Cours', text: d.database.course }]
        : []),
    ]);
    this.busy.set(false);

    if (result.ok && result.data.valid) {
      this.verdict.set({
        ok: true,
        title: 'Badge authentique ✓',
        detail: `Le smart contract confirme ce badge, délivré le ${formatDate(result.data.onChain.issuedAt)}.`,
      });
    } else if (result.ok) {
      this.verdict.set({
        ok: false,
        title: 'Aucun badge trouvé ✗',
        detail: 'Le smart contract ne connaît pas ce badge pour cette adresse et ce cours.',
      });
    } else {
      this.verdict.set({ ok: false, title: 'Vérification impossible', detail: result.data['message'] ?? 'Erreur' });
    }
  }
}
