import { Component, OnInit, inject, signal } from '@angular/core';
import { BackendService } from '../../core/backend.service';
import { ConfigService } from '../../core/config.service';
import { DocumentRecord } from '../../models';
import { CertificateButtonComponent } from '../../shared/certificate-button.component';
import { CopyButtonComponent } from '../../shared/copy-button.component';
import { IconComponent } from '../../shared/icon.component';
import { documentTypeLabel, documentVerificationLink, formatDate, short } from '../../util';

/** Les documents que l'ecole a remis a l'eleve : chacun est prouve par l'empreinte gravee sur la blockchain. */
@Component({
  selector: 'app-eleve-documents-page',
  imports: [CertificateButtonComponent, CopyButtonComponent, IconComponent],
  template: `
    <header class="page-head">
      <h1>Mes documents</h1>
      <p class="muted">Diplômes, relevés et attestations remis par l’école. Chacun est prouvé par une empreinte gravée sur la blockchain : téléchargez son certificat, ou partagez le lien pour que n’importe qui le vérifie.</p>
    </header>

    @if (loading()) {
      <p class="muted"><span class="spin"></span> Chargement…</p>
    } @else if (error()) {
      <div class="alert alert-err" role="alert"><app-icon name="alert" /><span>{{ error() }}</span></div>
    } @else if (!documents().length) {
      <div class="card empty-state" id="noDocuments">
        <app-icon name="file" [size]="32" />
        <p><b>Aucun document pour le moment.</b></p>
        <p class="muted">Quand l’école vous remettra un diplôme, un relevé ou une attestation, il apparaîtra ici.</p>
      </div>
    } @else {
      <div class="grid grid-2">
        @for (d of documents(); track d.id) {
          <article class="card course-card" [attr.data-document]="d.title">
            <header>
              <span class="pill">{{ typeLabel(d.type) }}</span>
              <span class="pill pill-ok">Prouvé sur la blockchain ✓</span>
            </header>
            <h3>{{ d.title }}</h3>
            <p class="muted">Gravé le {{ formatDate(d.blockTime) }} · bloc {{ d.blockNumber }}</p>
            <div class="hash-box">
              <span class="hash-label">Empreinte SHA-256</span>
              <span class="mono">{{ short(d.hash) }}</span>
            </div>
            <div class="inline-actions">
              <app-certificate-button [document]="d" />
              <app-copy-button [text]="link(d)" label="Copier le lien de vérification" />
              @if (config.txUrl(d.txHash); as url) {
                <a class="btn btn-ghost btn-sm" [href]="url" target="_blank" rel="noopener">Transaction <app-icon name="external" [size]="14" /></a>
              }
            </div>
          </article>
        }
      </div>
      <p class="field-hint"><app-icon name="lock" [size]="14" /> Le serveur ne conserve pas vos fichiers, seulement leur empreinte : gardez l’original, il est nécessaire pour prouver qu’il n’a pas changé.</p>
    }
  `,
})
export class EleveDocumentsPage implements OnInit {
  private readonly backend = inject(BackendService);
  protected readonly config = inject(ConfigService);

  protected readonly documents = signal<DocumentRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly short = short;
  protected readonly formatDate = formatDate;
  protected readonly typeLabel = documentTypeLabel;

  async ngOnInit(): Promise<void> {
    const result = await this.backend.myDocuments();
    this.loading.set(false);
    if (result.ok) {
      this.documents.set(result.data.documents);
    } else {
      this.error.set(result.data['message'] ?? 'Impossible de charger vos documents.');
    }
  }

  protected link(d: DocumentRecord): string {
    return documentVerificationLink(d.hash);
  }
}
