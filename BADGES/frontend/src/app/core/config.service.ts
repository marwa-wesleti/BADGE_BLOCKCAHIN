import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AppConfig } from '../models';

/** Les informations publiques du serveur (reseau, adresses des contrats) et les liens vers l'explorateur Etherscan. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly api = inject(ApiService);

  readonly config = signal<AppConfig | null>(null);
  readonly failed = signal(false);
  readonly network = computed(() => this.config()?.network ?? '');
  readonly registryAddress = computed(() => this.config()?.contractAddress ?? null);
  readonly nftAddress = computed(() => this.config()?.nftContractAddress || null);

  private loading = false;

  /** Charge la configuration une seule fois. */
  async load(): Promise<void> {
    if (this.loading || this.config()) {
      return;
    }
    this.loading = true;
    const result = await this.api.call<AppConfig>('GET', '/api/config');
    this.loading = false;
    if (result.ok) {
      this.config.set(result.data);
      this.failed.set(false);
    } else {
      this.failed.set(true);
    }
  }

  /** Pas de lien sur un reseau local : Etherscan ne connait pas votre blockchain locale. */
  txUrl(hash: string | null | undefined): string | undefined {
    return this.link('tx', hash);
  }

  addressUrl(address: string | null | undefined): string | undefined {
    return this.link('address', address);
  }

  /** Page d'un jeton NFT : contrat puis numero. */
  tokenUrl(contract: string | null | undefined, tokenId: number | null | undefined): string | undefined {
    const base = this.config()?.explorer;
    return base && contract && tokenId != null ? `${base}/nft/${contract}/${tokenId}` : undefined;
  }

  private link(kind: 'tx' | 'address', value: string | null | undefined): string | undefined {
    const base = this.config()?.explorer;
    return base && value ? `${base}/${kind}/${value}` : undefined;
  }
}
