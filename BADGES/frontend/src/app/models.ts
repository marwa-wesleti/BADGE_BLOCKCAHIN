/** Corps JSON renvoye par l'API : les champs varient selon la route, on les lit prudemment. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiBody = Record<string, any>;

/**
 * Une reponse de l'API : soit une reussite, dont `data` a la forme attendue (T), soit un refus ou une panne, dont
 * `data` est le corps d'erreur du serveur ({ success: false, message }). Tester `ok` dit lequel des deux on a.
 * `status` est le code HTTP ; 0 = le serveur n'a pas repondu.
 */
export type ApiResult<T = ApiBody> =
  | { status: number; ok: true; data: T }
  | { status: number; ok: false; data: ApiBody };

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

export type Role = 'ECOLE' | 'ELEVE';

export interface Course {
  id: number;
  title: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
}

export interface User {
  id: number;
  username: string;
  email: string;
  walletAddress: string;
  role: Role;
  /** Vrai apres une reinitialisation par l'ecole : l'eleve doit choisir son propre mot de passe avant de continuer. */
  mustChangePassword?: boolean;
  completedCourses?: Course[];
}

/** Un badge du registre : une ligne dans le contrat, avec la trace de sa transaction. */
export interface BadgeRecord {
  id: string;
  courseId: number;
  course: string;
  owner: string;
  contractAddress: string;
  txHash: string;
  blockNumber: number;
  blockTime: string;
}

/** Un badge NFT : un jeton numerote dont l'eleve est proprietaire. */
export interface NftBadgeRecord extends BadgeRecord {
  tokenId: number;
}

/** Un eleve vu par l'ecole, avec l'etat de chacun de ses cours. */
export interface StudentRow extends User {
  hasPassword: boolean;
  completedCourseIds: number[];
  badgeCourseIds: number[];
  nftCourseIds: number[];
}

export interface Overview {
  students: number;
  courses: number;
  /** Nombre de cours valides, tous eleves confondus. */
  completions: number;
  badges: number;
  nftBadges: number;
  contractAddress: string | null;
  nftContractAddress: string | null;
}

export type DocumentType = 'DIPLOME' | 'RELEVE' | 'ATTESTATION' | 'AUTRE';

/** Un document emis par l'ecole : on ne garde que son titre et son empreinte, jamais son contenu. */
export interface DocumentRecord {
  id: string;
  title: string;
  type: DocumentType;
  hash: string;
  /** Eleve a qui il est remis ; null = archive de l'ecole. */
  student: User | null;
  contractAddress: string;
  txHash: string;
  blockNumber: number;
  blockTime: string;
  createdAt: string;
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
