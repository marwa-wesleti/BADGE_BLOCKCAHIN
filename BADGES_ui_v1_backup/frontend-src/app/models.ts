/** Corps JSON renvoye par l'API : les champs varient selon la route, on les lit prudemment. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiBody = Record<string, any>;

export interface ApiResult<T = ApiBody> {
  /** Code HTTP ; 0 = le serveur n'a pas repondu. */
  status: number;
  ok: boolean;
  data: T;
}

/** Reponse de GET /api/config : jamais de secret. */
export interface AppConfig {
  network: string;
  chainId: number;
  contractAddress: string | null;
  /** Contrat des badges NFT ; absent ou vide tant qu'il n'est pas deploye. */
  nftContractAddress?: string | null;
  /** Site pour consulter la blockchain (Etherscan) ; null sur un reseau local. */
  explorer: string | null;
}

export type EntryKind = 'pending' | 'ok' | 'warn' | 'err';

/** Une ligne "libelle : valeur" du journal ; href = lien (Etherscan) si disponible. */
export interface Fact {
  label: string;
  text: string;
  href?: string;
}

export interface JournalEntry {
  id: number;
  title: string;
  time: string;
  kind: EntryKind;
  label: string;
  message?: string;
  facts: Fact[];
  raw?: unknown;
}

/** Verdict affiche sous une verification : vert (ok) ou rouge. */
export interface Verdict {
  ok: boolean;
  title: string;
  detail: string;
}

export interface TxInfo {
  txHash?: string;
  blockNumber?: number;
  blockTime?: string;
}
