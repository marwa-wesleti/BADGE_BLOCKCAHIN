import { Component, inject, input, signal } from '@angular/core';
import { BackendService } from '../core/backend.service';
import { ToastService } from '../core/toast.service';
import { DocumentRecord } from '../models';
import { saveBlob } from '../util';
import { IconComponent } from './icon.component';

/** Telecharge le certificat de preuve (PDF) d'un document : pour l'ecole comme pour l'eleve a qui il est remis. */
@Component({
  selector: 'app-certificate-button',
  imports: [IconComponent],
  template: `
    <button type="button" class="btn btn-ghost btn-sm" data-action="certificate" [disabled]="busy()" (click)="download()">
      @if (busy()) { <span class="spin"></span> } @else { <app-icon name="file" [size]="16" /> }
      Certificat PDF
    </button>
  `,
})
export class CertificateButtonComponent {
  readonly document = input.required<DocumentRecord>();

  private readonly backend = inject(BackendService);
  private readonly toasts = inject(ToastService);
  protected readonly busy = signal(false);

  protected async download(): Promise<void> {
    this.busy.set(true);
    const result = await this.backend.certificate(this.document().id);
    this.busy.set(false);
    if (!result.ok) {
      this.toasts.error(result.data['message'] ?? 'Le certificat n’a pas pu être généré.');
      return;
    }
    saveBlob(result.data.blob, result.data.filename);
  }
}
