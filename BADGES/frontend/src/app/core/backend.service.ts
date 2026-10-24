import { Injectable, inject } from '@angular/core';
import { ActionRunner } from './action-runner.service';
import { ApiService } from './api.service';
import { ConfigService } from './config.service';
import {
  ApiBody, ApiResult, BadgeRecord, Course, DocumentRecord, DocumentType, Fact, NftBadgeRecord, Overview, StudentRow, TxInfo, User,
} from '../models';
import { formatDate, short } from '../util';

export interface MeResponse extends ApiBody {
  user: User;
  badges: BadgeRecord[];
  nftBadges: NftBadgeRecord[];
}

export interface VerifyBadgeResponse extends ApiBody {
  valid: boolean;
  onChain: { walletAddress: string; courseId: number; issuedAt: string | null; tokenId?: number | null; owner?: string | null };
  database: { user: string; course: string } | null;
}

export interface VerifyHashResponse extends ApiBody {
  valid: boolean;
  computedHash: string;
  anchoredAt: string | null;
}

export interface IssueBadgeResponse extends ApiBody {
  badge: BadgeRecord & { tokenId?: number };
  links: { transaction: string; contract: string; token?: string };
}

/** Un compte eleve cree par l'ecole : le temporaire et la cle privee n'arrivent qu'ici, une seule fois. */
export interface CreatedStudentResponse extends ApiBody {
  user: User;
  temporaryPassword: string;
  privateKey: string;
}

export interface IssueDocumentResponse extends ApiBody {
  document: DocumentRecord;
  links: { transaction: string; contract: string };
}

export interface AnchorResponse extends ApiBody, TxInfo {
  hash: string;
  links: { transaction: string; contract: string };
}

/**
 * Tous les appels a l'API, en un seul endroit. Les ECRITURES (celles que fait l'ecole) passent par ActionRunner :
 * elles apparaissent dans le journal des echanges, avec le lien vers la blockchain. Les lectures sont silencieuses.
 * L'inscription et la connexion n'y passent jamais : leurs reponses contiennent des secrets (cle privee, jeton).
 */
@Injectable({ providedIn: 'root' })
export class BackendService {
  private readonly api = inject(ApiService);
  private readonly runner = inject(ActionRunner);
  private readonly config = inject(ConfigService);

  // ---------- lectures ----------

  courses(): Promise<ApiResult<{ courses: Course[] }>> {
    return this.api.call('GET', '/api/courses');
  }

  me(): Promise<ApiResult<MeResponse>> {
    return this.api.call('GET', '/api/me');
  }

  overview(): Promise<ApiResult<Overview>> {
    return this.api.call('GET', '/api/school/overview');
  }

  wallet(): Promise<ApiResult<{ address: string; balanceEth: string }>> {
    return this.api.call('GET', '/api/school/wallet');
  }

  students(): Promise<ApiResult<{ students: StudentRow[] }>> {
    return this.api.call('GET', '/api/school/students');
  }

  /** Le registre de l'ecole : tous les documents emis, les plus recents d'abord. */
  schoolDocuments(): Promise<ApiResult<{ documents: DocumentRecord[] }>> {
    return this.api.call('GET', '/api/school/documents');
  }

  /** Les documents remis a la personne connectee. */
  myDocuments(): Promise<ApiResult<{ documents: DocumentRecord[] }>> {
    return this.api.call('GET', '/api/me/documents');
  }

  /** Le certificat PDF d'un document (ecole, ou eleve a qui il est remis). */
  certificate(documentId: string): Promise<ApiResult<{ blob: Blob; filename: string }>> {
    return this.api.download(`/api/documents/${encodeURIComponent(documentId)}/certificate`);
  }

  /** Verification PUBLIQUE d'un badge du registre : lue dans le contrat. */
  verifyBadge(wallet: string, courseId: string | number): Promise<ApiResult<VerifyBadgeResponse>> {
    return this.api.call('GET', `/api/badges/verify/${encodeURIComponent(wallet.trim())}/${encodeURIComponent(String(courseId))}`);
  }

  verifyNft(wallet: string, courseId: string | number): Promise<ApiResult<VerifyBadgeResponse>> {
    return this.api.call('GET', `/api/nft-badges/verify/${encodeURIComponent(wallet.trim())}/${encodeURIComponent(String(courseId))}`);
  }

  verifyHash(hash: string): Promise<ApiResult<VerifyHashResponse>> {
    return this.api.call('POST', '/api/proofs/hash/verify', { hash });
  }

  /**
   * L'ecole cree le compte d'un eleve. Le mot de passe temporaire et la cle privee ne sont montres qu'une fois :
   * volontairement hors journal, pour qu'ils n'y soient jamais recopies.
   */
  createStudent(username: string, email: string): Promise<ApiResult<CreatedStudentResponse>> {
    return this.api.call('POST', '/api/school/students', { username, email });
  }

  /** Mot de passe temporaire : volontairement hors journal, pour qu'il n'y soit jamais recopie. */
  resetPassword(studentId: number): Promise<ApiResult<{ temporaryPassword: string }>> {
    return this.api.call('POST', `/api/school/students/${studentId}/reset-password`, {});
  }

  // ---------- ecritures de l'ecole (journalisees) ----------

  createCourse(title: string, description: string, difficulty: Course['difficulty']): Promise<ApiResult<{ course: Course }>> {
    return this.runner.run('Création du cours', 'POST', '/api/courses', { title, description, difficulty },
      (d: { course: Course }) => [
        { label: 'Numéro', text: String(d.course.id) },
        { label: 'Titre', text: d.course.title },
      ]);
  }

  completeCourse(courseId: number, email: string): Promise<ApiResult> {
    return this.runner.run('Cours validé pour un élève', 'POST', `/api/courses/${courseId}/complete`, { email },
      () => [{ label: 'Élève', text: email }, { label: 'Cours', text: String(courseId) }]);
  }

  issueBadge(email: string, courseId: number): Promise<ApiResult<IssueBadgeResponse>> {
    return this.runner.run<IssueBadgeResponse>('Badge délivré (registre)', 'POST', '/api/badges/issue', { email, courseId },
      (d) => [{ label: 'Cours', text: d.badge.course }, ...this.txFacts(d.badge)]);
  }

  issueNft(email: string, courseId: number): Promise<ApiResult<IssueBadgeResponse>> {
    return this.runner.run<IssueBadgeResponse>('Badge NFT créé', 'POST', '/api/nft-badges/issue', { email, courseId },
      (d) => [
        { label: 'Cours', text: d.badge.course },
        { label: 'Jeton n°', text: String(d.badge.tokenId), href: this.config.tokenUrl(d.badge.contractAddress, d.badge.tokenId) },
        ...this.txFacts(d.badge),
      ]);
  }

  anchorHash(hash: string): Promise<ApiResult<AnchorResponse>> {
    return this.runner.run<AnchorResponse>('Empreinte gravée', 'POST', '/api/proofs/hash', { hash },
      (d) => [{ label: 'Empreinte', text: short(d.hash) }, ...this.txFacts(d)]);
  }

  /** Emet un document : grave son empreinte et l'enregistre (avec son destinataire eventuel). */
  issueDocument(title: string, type: DocumentType, studentId: number | null, hash: string): Promise<ApiResult<IssueDocumentResponse>> {
    return this.runner.run<IssueDocumentResponse>('Document émis', 'POST', '/api/documents', { title, type, studentId, hash },
      (d) => [{ label: 'Titre', text: d.document.title }, { label: 'Empreinte', text: short(d.document.hash) }, ...this.txFacts(d.document)]);
  }

  /** Les lignes "transaction / bloc / date" communes a toutes les ecritures. */
  txFacts(tx: TxInfo): Fact[] {
    const facts: Fact[] = [];
    if (tx.txHash) {
      facts.push({ label: 'Transaction', text: short(tx.txHash), href: this.config.txUrl(tx.txHash) });
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
