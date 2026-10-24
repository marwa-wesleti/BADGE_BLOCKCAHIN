import { Component, effect, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CopyButtonComponent } from './copy-button.component';
import { IconComponent } from './icon.component';
import { cryptoAvailable, sha256File, sha256Hex } from '../util';

/**
 * Saisie d'un document (texte tape, ou fichier choisi) et calcul de son empreinte SHA-256 DANS LE NAVIGATEUR.
 * Le document ne part jamais : seule l'empreinte (`hash`) est transmise au reste de la page.
 */
@Component({
  selector: 'app-hash-input',
  imports: [FormsModule, CopyButtonComponent, IconComponent],
  template: `
    <div class="tabs" role="tablist" aria-label="Type de document">
      <button type="button" role="tab" [attr.aria-selected]="mode() === 'texte'" [class.active]="mode() === 'texte'"
              id="tabTexte" (click)="setMode('texte')">Texte</button>
      <button type="button" role="tab" [attr.aria-selected]="mode() === 'fichier'" [class.active]="mode() === 'fichier'"
              id="tabFichier" (click)="setMode('fichier')">Fichier</button>
    </div>

    @if (!cryptoOk) {
      <div class="alert alert-warn">
        <app-icon name="alert" />
        <span>Ce navigateur ne peut pas calculer l’empreinte ici (connexion non sécurisée). Ouvrez la page en HTTPS ou sur localhost.</span>
      </div>
    }

    @if (mode() === 'texte') {
      <label for="documentText">Texte du document</label>
      <textarea id="documentText" rows="4" [ngModel]="text()" (ngModelChange)="text.set($event)"
                placeholder="Collez ou tapez le texte à prouver…"></textarea>
    } @else {
      <label for="documentFile">Fichier</label>
      <input id="documentFile" type="file" (change)="onFile($event)">
      @if (fileName()) {
        <p class="field-hint">{{ fileName() }} · {{ fileSize() }} octets</p>
      }
    }

    <div class="hash-box" [class.empty]="!hash()" aria-live="polite">
      <span class="hash-label">Empreinte SHA-256, calculée ici dans votre navigateur</span>
      @if (busy()) {
        <span class="mono"><span class="spin"></span> calcul…</span>
      } @else if (hash()) {
        <span class="mono" id="hashValue">{{ hash() }}</span>
        <app-copy-button [text]="hash()" label="Copier l’empreinte" />
      } @else {
        <span class="muted">Elle apparaîtra dès que vous aurez saisi un document.</span>
      }
    </div>
    <p class="field-hint"><app-icon name="lock" [size]="14" /> Seule l’empreinte est envoyée au serveur : le document ne quitte jamais votre ordinateur.</p>
  `,
})
export class HashInputComponent {
  /** L'empreinte calculee ; vide tant qu'il n'y a pas de document. Le parent la lit (liaison a double sens). */
  readonly hash = model('');

  protected readonly mode = signal<'texte' | 'fichier'>('texte');
  protected readonly text = signal('');
  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly busy = signal(false);
  protected readonly cryptoOk = cryptoAvailable();

  constructor() {
    // A chaque frappe, l'empreinte est recalculee ici : on voit qu'une seule lettre change tout.
    effect(() => {
      if (this.mode() !== 'texte') {
        return;
      }
      const current = this.text();
      if (!current || !this.cryptoOk) {
        this.hash.set('');
        return;
      }
      void sha256Hex(current).then((value) => {
        // ignore un calcul devenu perime si l'utilisateur a continue de taper
        if (this.text() === current) {
          this.hash.set(value);
        }
      });
    });
  }

  protected setMode(mode: 'texte' | 'fichier'): void {
    this.mode.set(mode);
    this.text.set('');
    this.fileName.set('');
    this.fileSize.set(0);
    this.hash.set('');
  }

  protected async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.cryptoOk) {
      this.fileName.set('');
      this.hash.set('');
      return;
    }
    this.busy.set(true);
    this.hash.set('');
    try {
      this.hash.set(await sha256File(file));
      this.fileName.set(file.name);
      this.fileSize.set(file.size);
    } finally {
      this.busy.set(false);
    }
  }
}
