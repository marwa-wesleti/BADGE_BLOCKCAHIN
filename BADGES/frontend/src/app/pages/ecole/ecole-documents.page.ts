import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BackendService } from '../../core/backend.service';
import { ConfigService } from '../../core/config.service';
import { ToastService } from '../../core/toast.service';
import { DocumentRecord, DocumentType, StudentRow, Verdict } from '../../models';
import { CertificateButtonComponent } from '../../shared/certificate-button.component';
import { CopyButtonComponent } from '../../shared/copy-button.component';
import { HashInputComponent } from '../../shared/hash-input.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { VerdictComponent } from '../../shared/verdict.component';
import { DOCUMENT_TYPES, documentTypeLabel, documentVerificationLink, formatDate, short } from '../../util';

/**
 * Documents de l'ecole : on emet un document (diplome, releve, attestation...) pour un eleve, ce qui grave son empreinte
 * dans le contrat, et on retrouve tout ce qui a ete emis dans le registre. Le document lui-meme ne quitte jamais l'ordinateur.
 */
@Component({
  selector: 'app-ecole-documents-page',
  imports: [FormsModule, CertificateButtonComponent, CopyButtonComponent, HashInputComponent, IconComponent, ModalComponent, VerdictComponent],
  template: `
    <header class="page-head">
      <h1>Documents</h1>
      <p class="muted">Émettez un diplôme, un relevé ou une attestation : son empreinte est gravée sur la blockchain, l’élève le retrouve dans son espace avec un certificat de preuve. Le document n’est jamais publié ni conservé.</p>
    </header>

    <div class="grid grid-2">
      <section class="card" aria-labelledby="titre-emission">
        <h2 id="titre-emission">Émettre un document</h2>

        <label for="docTitle">Titre</label>
        <input id="docTitle" maxlength="120" autocomplete="off" placeholder="Ex. Diplôme d’ingénieur, promotion 2026"
               [ngModel]="title()" (ngModelChange)="title.set($event)">

        <div class="form-row">
          <div class="grow">
            <label for="docType">Type</label>
            <select id="docType" [ngModel]="type()" (ngModelChange)="type.set($event)">
              @for (t of types; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
            </select>
          </div>
          <div class="grow">
            <label for="docStudent">Remis à</label>
            <select id="docStudent" [ngModel]="studentChoice()" (ngModelChange)="studentChoice.set($event)">
              <option value="">Aucun élève (archive de l’école)</option>
              @for (s of students(); track s.id) { <option [value]="s.id">{{ s.username }} · {{ s.email }}</option> }
            </select>
          </div>
        </div>

        <label>Document</label>
        @for (n of [resetKey()]; track n) {
          <app-hash-input [(hash)]="hash" />
        }

        <div class="inline-actions">
          <button type="button" class="btn btn-primary" id="btnIssue" [disabled]="!canIssue()" (click)="askIssue()">
            @if (busy()) { <span class="spin"></span> } @else { <app-icon name="lock" /> } Émettre le document
          </button>
          <button type="button" class="btn btn-secondary" id="btnVerify" [disabled]="!hash() || busy()" (click)="verify()">
            <app-icon name="search" /> Déjà prouvé ?
          </button>
        </div>
        <app-verdict [verdict]="verdict()" />

        @if (last(); as d) {
          <div class="alert alert-ok" role="status" id="issueResult">
            <app-icon name="check" />
            <span>
              « {{ d.title }} » est émis : empreinte <span class="mono">{{ short(d.hash) }}</span> gravée dans le bloc {{ d.blockNumber }}
              le {{ formatDate(d.blockTime) }}.
              @if (config.txUrl(d.txHash); as url) {
                <a [href]="url" target="_blank" rel="noopener">Voir la transaction <app-icon name="external" [size]="14" /></a>
              }
            </span>
          </div>
          <div class="inline-actions"><app-certificate-button [document]="d" /></div>
        }
      </section>

      <section class="card" aria-labelledby="titre-explication">
        <h2 id="titre-explication">Ce qui se passe</h2>
        <ol class="plain-steps">
          <li>L’empreinte (64 caractères) est calculée dans <b>votre navigateur</b> : le fichier ne part pas.</li>
          <li>Seule elle est envoyée au serveur, qui la fait signer par l’école.</li>
          <li>Le contrat l’enregistre avec la <b>date du bloc</b>. Il refuse de graver deux fois la même : la date d’origine ne peut pas être rajeunie.</li>
          <li>L’élève retrouve le document dans <b>Mes documents</b>, avec un certificat PDF et un QR code qui mène à la vérification publique.</li>
        </ol>
        <p class="field-hint">Elle prouve que ce contenu exact existait à cette date. Elle ne dit ni qui l’a écrit, ni si son contenu est vrai. Pour modifier un document, on grave la nouvelle version : l’ancienne reste prouvée.</p>
      </section>
    </div>

    <section class="card" aria-labelledby="titre-registre">
      <div class="toolbar">
        <div class="grow">
          <h2 id="titre-registre">Documents émis <span class="pill" id="docCount">{{ documents().length }}</span></h2>
        </div>
        <div class="grow">
          <label for="docSearch">Rechercher</label>
          <input id="docSearch" type="search" autocomplete="off" placeholder="Titre, élève ou empreinte"
                 [ngModel]="query()" (ngModelChange)="query.set($event)">
        </div>
        <div class="narrow">
          <label for="docFilterType">Type</label>
          <select id="docFilterType" [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event)">
            <option value="">Tous</option>
            @for (t of types; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
          </select>
        </div>
      </div>

      @if (loading()) {
        <p class="muted"><span class="spin"></span> Chargement…</p>
      } @else if (loadError()) {
        <div class="alert alert-err" role="alert"><app-icon name="alert" /><span>{{ loadError() }}</span></div>
      } @else if (!documents().length) {
        <div class="empty-state" id="noDocuments">
          <app-icon name="file" [size]="32" />
          <p><b>Aucun document émis pour le moment.</b></p>
          <p class="muted">Le premier que vous émettrez apparaîtra ici.</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table" id="documentsTable">
            <thead>
              <tr>
                <th scope="col">Document</th><th scope="col">Remis à</th><th scope="col">Gravé le</th><th scope="col">Empreinte</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (d of filtered(); track d.id) {
                <tr [attr.data-document]="d.title">
                  <td>
                    <b>{{ d.title }}</b>
                    <small class="cell-sub">{{ typeLabel(d.type) }}</small>
                  </td>
                  <td>
                    @if (d.student) {
                      <b>{{ d.student.username }}</b>
                      <small class="cell-sub">{{ d.student.email }}</small>
                    } @else {
                      <span class="pill">archive de l’école</span>
                    }
                  </td>
                  <td>{{ formatDate(d.blockTime) }}</td>
                  <td>
                    <span class="mono">{{ short(d.hash) }}</span>
                    <app-copy-button [text]="d.hash" label="Copier" />
                  </td>
                  <td class="actions-cell">
                    <app-certificate-button [document]="d" />
                    <app-copy-button [text]="link(d)" label="Copier le lien" />
                    @if (config.txUrl(d.txHash); as url) {
                      <a class="btn btn-ghost btn-sm" [href]="url" target="_blank" rel="noopener">Transaction <app-icon name="external" [size]="14" /></a>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="muted">Aucun document ne correspond à cette recherche.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    <app-modal [open]="confirming()" label="Confirmer l’émission" (closed)="confirming.set(false)">
      <h2>Émettre ce document ?</h2>
      <dl class="kv">
        <dt>Titre</dt><dd>{{ title().trim() }}</dd>
        <dt>Type</dt><dd>{{ typeLabel(type()) }}</dd>
        <dt>Remis à</dt><dd>{{ recipientLabel() }}</dd>
      </dl>
      <div class="hash-box"><span class="mono">{{ hash() }}</span></div>
      <p>Cette écriture est <b>publique et permanente</b> : personne, pas même l’école, ne pourra l’effacer. Elle consomme un peu d’ETH de test et prend une dizaine de secondes.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" (click)="confirming.set(false)">Annuler</button>
        <button type="button" class="btn btn-primary" id="btnConfirmIssue" (click)="issue()">Émettre définitivement</button>
      </div>
    </app-modal>
  `,
})
export class EcoleDocumentsPage implements OnInit {
  private readonly backend = inject(BackendService);
  private readonly toasts = inject(ToastService);
  protected readonly config = inject(ConfigService);

  protected readonly types = DOCUMENT_TYPES;
  protected readonly title = signal('');
  protected readonly type = signal<DocumentType>('DIPLOME');
  /** Valeur du menu "Remis a" : l'identifiant de l'eleve, ou vide pour une archive de l'ecole. */
  protected readonly studentChoice = signal('');
  protected readonly hash = signal('');
  /** Change pour vider la saisie du document apres une emission (le composant est recree). */
  protected readonly resetKey = signal(0);

  protected readonly students = signal<StudentRow[]>([]);
  protected readonly documents = signal<DocumentRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly query = signal('');
  protected readonly typeFilter = signal<'' | DocumentType>('');

  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);
  protected readonly verdict = signal<Verdict | null>(null);
  protected readonly last = signal<DocumentRecord | null>(null);

  protected readonly short = short;
  protected readonly formatDate = formatDate;
  protected readonly typeLabel = documentTypeLabel;

  protected readonly canIssue = computed(() => !!this.hash() && !!this.title().trim() && !this.busy());

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const type = this.typeFilter();
    return this.documents().filter((d) =>
      (!type || d.type === type)
      && (!q || [d.title, d.student?.username, d.student?.email, d.hash].some((field) => (field ?? '').toLowerCase().includes(q))));
  });

  protected readonly recipientLabel = computed(() => {
    const student = this.students().find((s) => String(s.id) === this.studentChoice());
    return student ? `${student.username} (${student.email})` : 'Aucun élève (archive de l’école)';
  });

  async ngOnInit(): Promise<void> {
    const [students, documents] = await Promise.all([this.backend.students(), this.backend.schoolDocuments()]);
    this.loading.set(false);
    if (students.ok) {
      this.students.set(students.data.students);
    }
    if (documents.ok) {
      this.documents.set(documents.data.documents);
    } else {
      this.loadError.set(documents.data['message'] ?? 'Impossible de charger les documents.');
    }
  }

  protected link(d: DocumentRecord): string {
    return documentVerificationLink(d.hash);
  }

  protected askIssue(): void {
    this.verdict.set(null);
    this.confirming.set(true);
  }

  protected async issue(): Promise<void> {
    this.confirming.set(false);
    this.busy.set(true);
    this.last.set(null);
    const studentId = this.studentChoice() ? Number(this.studentChoice()) : null;
    const result = await this.backend.issueDocument(this.title().trim(), this.type(), studentId, this.hash());
    this.busy.set(false);
    if (!result.ok) {
      const refused = result.status === 409 ? ' Rien n’a été envoyé sur la blockchain.' : '';
      this.toasts.error((result.data['message'] ?? 'Émission impossible.') + refused);
      return;
    }
    const d = result.data.document;
    this.last.set(d);
    this.documents.update((list) => [d, ...list]);
    this.title.set('');
    this.hash.set('');
    this.resetKey.update((n) => n + 1);
    this.toasts.success('Document émis : empreinte gravée sur la blockchain.', result.data.links?.transaction, 'Voir la transaction');
  }

  protected async verify(): Promise<void> {
    this.busy.set(true);
    this.verdict.set(null);
    const result = await this.backend.verifyHash(this.hash());
    this.busy.set(false);
    if (!result.ok) {
      this.verdict.set({ ok: false, title: 'Vérification impossible', detail: result.data['message'] ?? 'Erreur du serveur.' });
      return;
    }
    this.verdict.set(result.data.valid
      ? { ok: true, title: 'Document déjà prouvé ✓', detail: `Son empreinte a été gravée le ${formatDate(result.data.anchoredAt)}.` }
      : { ok: false, title: 'Pas encore gravé', detail: 'Aucune empreinte identique n’a été gravée : vous pouvez l’émettre.' });
  }
}
