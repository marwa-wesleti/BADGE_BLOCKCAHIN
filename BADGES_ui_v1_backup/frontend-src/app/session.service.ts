import { Injectable, computed, signal } from '@angular/core';
import { AppConfig, Fact, TxInfo } from './models';
import { formatDate } from './util';

export type StepName = 'register' | 'complete' | 'issue' | 'anchor' | 'nft';

/** Etat partage entre les etapes : qui est l'eleve, quel cours, ce qui est deja fait. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly config = signal<AppConfig | null>(null);
  readonly email = signal('alice@example.com');
  readonly wallet = signal('');
  /** Cle privee de l'eleve : gardee en memoire seulement, le temps de l'afficher une fois. */
  readonly privateKey = signal('');
  readonly courseId = signal('');
  readonly anchoredHash = signal('');
  readonly done = signal<Record<StepName, boolean>>({ register: false, complete: false, issue: false, anchor: false, nft: false });

  /**
   * Numero (0 a 3) de la premiere etape non terminee ; -1 quand les 4 premieres sont faites.
   * L'etape NFT (5) est une variante facultative : elle n'entre pas dans ce calcul.
   */
  readonly activeStep = computed(() => {
    const d = this.done();
    return [d.register, d.complete, d.issue, d.anchor].findIndex((finished) => !finished);
  });

  markDone(step: StepName): void {
    this.done.update((d) => ({ ...d, [step]: true }));
  }

  /** Lien Etherscan, ou undefined sur un reseau local (les liens n'auraient aucun sens). */
  explorerUrl(kind: 'tx' | 'address', value: string | null | undefined): string | undefined {
    const base = this.config()?.explorer;
    return base && value ? `${base}/${kind}/${value}` : undefined;
  }

  /** Page d'un jeton NFT sur l'explorateur, ou undefined sur un reseau local. */
  explorerNftUrl(contract: string | null | undefined, tokenId: number | null | undefined): string | undefined {
    const base = this.config()?.explorer;
    return base && contract && tokenId != null ? `${base}/nft/${contract}/${tokenId}` : undefined;
  }

  /** Lignes "transaction / bloc / date" communes a la delivrance d'un badge et a la gravure d'une empreinte. */
  txFacts(tx: TxInfo): Fact[] {
    const facts: Fact[] = [];
    if (tx.txHash) {
      facts.push({ label: 'Transaction', text: `${tx.txHash.slice(0, 8)}…${tx.txHash.slice(-6)}`, href: this.explorerUrl('tx', tx.txHash) });
    }
    if (tx.blockNumber != null) {
      facts.push({ label: 'Bloc', text: String(tx.blockNumber) });
    }
    if (tx.blockTime) {
      facts.push({ label: 'Date du bloc', text: formatDate(tx.blockTime) });
    }
    return facts;
  }
}
