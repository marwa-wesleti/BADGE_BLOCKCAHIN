import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

/**
 * Fenetre modale basee sur l'element natif <dialog> : le navigateur gere deja le focus, la touche Echap et le fond grise.
 * Le parent garde `open` ; la modale previent par `closed` quand elle se ferme (Echap, clic a cote, bouton).
 */
@Component({
  selector: 'app-modal',
  template: `
    <dialog #dialog class="modal" (close)="closed.emit()" (click)="onBackdrop($event)" [attr.aria-label]="label()">
      <div class="modal-body"><ng-content /></div>
    </dialog>
  `,
})
export class ModalComponent {
  readonly open = input.required<boolean>();
  readonly label = input('Fenêtre');
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  protected onBackdrop(event: MouseEvent): void {
    // un clic sur le fond (et non sur le contenu) ferme la fenetre
    if (event.target === this.dialog().nativeElement) {
      this.dialog().nativeElement.close();
    }
  }
}
