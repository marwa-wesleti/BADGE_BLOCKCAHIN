import { Component, input, signal } from '@angular/core';

/** Bouton "Copier" : met le texte dans le presse-papiers et confirme pendant un instant. */
@Component({
  selector: 'app-copy-button',
  template: `<button type="button" class="btn btn-ghost btn-sm" [attr.id]="buttonId()" (click)="copy()">{{ copied() ? 'Copié ✓' : label() }}</button>`,
})
export class CopyButtonComponent {
  readonly text = input.required<string>();
  readonly label = input('Copier');
  readonly buttonId = input<string | null>(null);
  readonly copied = signal(false);

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text());
    } catch {
      // contexte non securise ou autorisation refusee : repli sur l'ancienne methode
      const area = document.createElement('textarea');
      area.value = this.text();
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1400);
  }
}
