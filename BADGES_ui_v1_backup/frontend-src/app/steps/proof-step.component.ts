import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionRunner } from '../action-runner.service';
import { ApiBody, Verdict } from '../models';
import { SessionService } from '../session.service';
import { countDifferences, cryptoAvailable, formatDate, sha256Hex, short } from '../util';

interface AnchorResponse extends ApiBody {
  hash: string;
  txHash: string;
  blockNumber: number;
  blockTime: string;
}

interface VerifyProofResponse extends ApiBody {
  valid: boolean;
  computedHash: string;
  anchoredAt: string | null;
}

@Component({
  selector: 'app-proof-step',
  imports: [FormsModule],
  host: {
    class: 'step',
    id: 'step4',
    '[class.done]': 'session.done().anchor',
    '[class.active]': 'session.activeStep() === 3',
  },
  template: `
    <h2><span class="num">{{ session.done().anchor ? '✓' : 4 }}</span> Preuve d'intégrité d'un document</h2>
    <p class="hint">Seule l'empreinte SHA-256 du texte est écrite sur la blockchain, jamais le texte.</p>
    <div class="body">
      <label for="docContent">Texte du document</label>
      <textarea id="docContent" rows="3" [(ngModel)]="text"></textarea>

      @if (liveHash()) {
        <div class="live" id="liveHash">
          <div>Empreinte SHA-256 calculée dans votre navigateur : <span class="mono">{{ liveHash() }}</span></div>
          @if (session.anchoredHash()) {
            @if (liveHash() === session.anchoredHash()) {
              <div class="diff-ok">Identique à l'empreinte gravée ✓</div>
            } @else {
              <div class="diff-ko">
                Différente de l'empreinte gravée : {{ differences() }} caractères sur 64 changent pour une petite modification.
              </div>
            }
          }
        </div>
      }

      <div class="actions">
        <button class="primary" id="btnAnchor" [disabled]="busy()" (click)="anchor()">Graver l'empreinte</button>
        <button id="btnVerifyDoc" [disabled]="busy()" (click)="verify()">Vérifier le texte ci-dessus</button>
      </div>

      <div id="docVerdict" aria-live="polite">
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
export class ProofStepComponent {
  protected readonly session = inject(SessionService);
  private readonly runner = inject(ActionRunner);

  protected readonly text = signal('Contrat v1 - signé le 10/10/2026');
  protected readonly liveHash = signal('');
  protected readonly busy = signal(false);
  protected readonly verdict = signal<Verdict | null>(null);
  protected readonly differences = computed(() => countDifferences(this.liveHash(), this.session.anchoredHash()));

  constructor() {
    // A chaque frappe, l'empreinte est recalculee ici, dans le navigateur : on voit le hash changer entierement.
    effect(() => {
      const current = this.text();
      if (cryptoAvailable()) {
        sha256Hex(current).then((hash) => this.liveHash.set(hash));
      }
    });
  }

  protected async anchor(): Promise<void> {
    this.busy.set(true);
    const result = await this.runner.run<AnchorResponse>(
      'Gravure de l\'empreinte',
      'POST',
      '/api/proofs',
      { content: this.text() },
      (d) => [{ label: 'Empreinte', text: short(d.hash) }, ...this.session.txFacts(d)],
    );
    this.busy.set(false);
    if (result.ok) {
      this.session.anchoredHash.set(result.data.hash);
      this.session.markDone('anchor');
    }
  }

  protected async verify(): Promise<void> {
    this.busy.set(true);
    const result = await this.runner.run<VerifyProofResponse>(
      'Vérification du texte',
      'POST',
      '/api/proofs/verify',
      { content: this.text() },
      (d) => [
        { label: 'Empreinte', text: short(d.computedHash) },
        { label: 'Gravée le', text: d.anchoredAt ? formatDate(d.anchoredAt) : 'jamais' },
      ],
    );
    this.busy.set(false);

    if (result.ok && result.data.valid) {
      this.verdict.set({
        ok: true,
        title: 'Texte intact ✓',
        detail: `Son empreinte a été gravée le ${formatDate(result.data.anchoredAt)} : il n'a pas changé depuis.`,
      });
    } else if (result.ok) {
      this.verdict.set({
        ok: false,
        title: 'Texte inconnu ou modifié ✗',
        detail: "Aucune empreinte identique n'a été gravée. Une seule lettre différente suffit à changer l'empreinte.",
      });
    } else {
      this.verdict.set({ ok: false, title: 'Vérification impossible', detail: result.data['message'] ?? 'Erreur' });
    }
  }
}
