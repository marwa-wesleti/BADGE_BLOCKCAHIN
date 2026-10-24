import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastService } from '../core/toast.service';
import { click, refresh, settle, text, type, waitFor } from '../testing';
import { HashInputComponent } from './hash-input.component';
import { ModalComponent } from './modal.component';
import { VerdictComponent } from './verdict.component';

@Component({
  imports: [HashInputComponent],
  template: `<app-hash-input [(hash)]="hash" /><span id="parentHash">{{ hash() }}</span>`,
})
class HashHost {
  hash = signal('');
}

@Component({
  imports: [ModalComponent],
  template: `<app-modal [open]="open()" label="Essai" (closed)="open.set(false)"><p id="inside">Contenu</p></app-modal>`,
})
class ModalHost {
  open = signal(false);
}

describe('HashInputComponent', () => {
  it('calcule dans le navigateur l\'empreinte du texte et la transmet au parent', async () => {
    const fixture = TestBed.createComponent(HashHost);
    fixture.detectChanges();
    await refresh(fixture); // laisse ngModel s'initialiser avant qu'on tape
    const page: HTMLElement = fixture.nativeElement;
    expect(text(page, '#parentHash')).toBe('');

    type(page.querySelector('#documentText'), 'abc');
    await waitFor(fixture, () => fixture.componentInstance.hash() !== '');
    // vecteur de test officiel du SHA-256
    expect(text(page, '#parentHash')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(text(page, '#hashValue')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('une lettre de plus change toute l\'empreinte, et vider le texte la supprime', async () => {
    const fixture = TestBed.createComponent(HashHost);
    fixture.detectChanges();
    await refresh(fixture); // laisse ngModel s'initialiser avant qu'on tape
    const page: HTMLElement = fixture.nativeElement;
    type(page.querySelector('#documentText'), 'abc');
    await waitFor(fixture, () => fixture.componentInstance.hash() !== '');
    const first = fixture.componentInstance.hash();
    type(page.querySelector('#documentText'), 'abcd');
    await waitFor(fixture, () => fixture.componentInstance.hash() !== first && fixture.componentInstance.hash() !== '');
    const second = fixture.componentInstance.hash();
    expect(second).not.toBe(first);
    expect(Array.from(first).filter((c, i) => c !== second[i]).length).toBeGreaterThan(40);

    type(page.querySelector('#documentText'), '');
    await waitFor(fixture, () => fixture.componentInstance.hash() === '');
    expect(fixture.componentInstance.hash()).toBe('');
  });

  it('changer d\'onglet efface le document precedent', async () => {
    const fixture = TestBed.createComponent(HashHost);
    fixture.detectChanges();
    await refresh(fixture); // laisse ngModel s'initialiser avant qu'on tape
    const page: HTMLElement = fixture.nativeElement;
    type(page.querySelector('#documentText'), 'abc');
    await waitFor(fixture, () => fixture.componentInstance.hash() !== '');
    click(page, '#tabFichier');
    await refresh(fixture);
    expect(fixture.componentInstance.hash()).toBe('');
    expect(page.querySelector('#documentFile')).not.toBeNull();
    expect(page.querySelector('#documentText')).toBeNull();
  });

  it('calcule l\'empreinte d\'un fichier, sans l\'envoyer nulle part', async () => {
    const fixture = TestBed.createComponent(HashHost);
    fixture.detectChanges();
    await refresh(fixture); // laisse ngModel s'initialiser avant qu'on tape
    const page: HTMLElement = fixture.nativeElement;
    click(page, '#tabFichier');
    await refresh(fixture);

    const input = page.querySelector('#documentFile') as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File(['abc'], 'piece.txt', { type: 'text/plain' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    await waitFor(fixture, () => fixture.componentInstance.hash() !== ''); // lecture du fichier puis calcul

    expect(fixture.componentInstance.hash()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(text(page)).toContain('piece.txt');
  });
});

describe('ModalComponent', () => {
  it('s\'ouvre et se ferme avec le parent', async () => {
    const fixture = TestBed.createComponent(ModalHost);
    fixture.detectChanges();
    const dialog = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog().open).toBeFalse();

    fixture.componentInstance.open.set(true);
    await settle(fixture);
    expect(dialog().open).toBeTrue();

    fixture.componentInstance.open.set(false);
    await settle(fixture);
    expect(dialog().open).toBeFalse();
  });

  it('previent le parent quand elle se ferme d\'elle-meme (Echap ou clic sur le fond)', async () => {
    const fixture = TestBed.createComponent(ModalHost);
    fixture.detectChanges();
    fixture.componentInstance.open.set(true);
    await settle(fixture);
    (fixture.nativeElement.querySelector('dialog') as HTMLDialogElement).close(); // ce que fait la touche Echap
    // le navigateur envoie l'evenement "close" un instant plus tard
    await waitFor(fixture, () => !fixture.componentInstance.open());
    expect(fixture.componentInstance.open()).toBeFalse();
  });
});

describe('VerdictComponent', () => {
  it('dit le resultat avec un texte et une icone, pas seulement une couleur', async () => {
    const fixture = TestBed.createComponent(VerdictComponent);
    fixture.componentRef.setInput('verdict', { ok: false, title: 'Aucun badge trouvé ✗', detail: 'Inconnu.' });
    fixture.detectChanges();
    const verdict = fixture.nativeElement.querySelector('.verdict') as HTMLElement;
    expect(verdict.classList).toContain('ko');
    expect(verdict.textContent).toContain('Aucun badge trouvé ✗');
    expect(verdict.querySelector('svg')).not.toBeNull();
  });

  it('n\'affiche rien sans verdict', () => {
    const fixture = TestBed.createComponent(VerdictComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.verdict')).toBeNull();
  });
});

describe('ToastService', () => {
  it('ajoute puis retire un message', () => {
    const toasts = TestBed.inject(ToastService);
    toasts.success('Fait', 'https://exemple.test', 'Voir');
    toasts.error('Raté');
    expect(toasts.toasts().map((t) => t.kind)).toEqual(['ok', 'err']);
    toasts.dismiss(toasts.toasts()[0].id);
    expect(toasts.toasts().map((t) => t.text)).toEqual(['Raté']);
  });
});
