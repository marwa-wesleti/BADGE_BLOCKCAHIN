import { ComponentFixture } from '@angular/core/testing';

/**
 * Outils partages par les tests des pages : taper dans un champ, cliquer, attendre que la page se mette a jour.
 *
 * Deux facons d'attendre, a ne pas confondre :
 *  - refresh() laisse s'executer les promesses en cours puis redessine la page. Elle n'attend PAS les requetes HTTP :
 *    c'est ce qu'il faut juste apres un clic qui envoie une requete qu'on va ensuite repondre.
 *  - settle() attend en plus que toutes les requetes soient terminees. Utilisable seulement quand il n'en reste aucune
 *    sans reponse : sinon elle attend indefiniment une reponse que le test n'a pas encore donnee.
 */

export const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export async function refresh(fixture: ComponentFixture<unknown>): Promise<void> {
  await tick();
  fixture.detectChanges();
  await tick();
  fixture.detectChanges();
}

export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Attend qu'une condition devienne vraie (par exemple un calcul fait par le navigateur), sans durée magique. */
export async function waitFor(fixture: ComponentFixture<unknown>, condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('La condition attendue ne s\'est pas realisee a temps');
    }
    await tick();
    fixture.detectChanges();
  }
}

export function type(element: Element | null, value: string): void {
  const field = element as HTMLInputElement | HTMLTextAreaElement;
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

export function choose(element: Element | null, index: number): void {
  const select = element as HTMLSelectElement;
  select.selectedIndex = index;
  select.dispatchEvent(new Event('change'));
}

export function click(root: ParentNode, selector: string): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Element introuvable : ${selector}`);
  }
  element.click();
}

/** Le texte visible d'un element (espaces regroupes). Sans selecteur : celui de l'element lui-meme. */
export function text(root: ParentNode, selector?: string): string {
  const element = selector ? root.querySelector(selector) : (root as Element);
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export const ELEVE = { id: 3, username: 'marwa', email: 'marwa@example.com', walletAddress: '0x61aa685ca727156af0d49029a49a28e8eac87f80', role: 'ELEVE' as const };
export const ECOLE = { id: 1, username: 'ecole', email: 'ecole@example.com', walletAddress: '0x8101cd9837add3b61f3465e8429e57769ccff52e', role: 'ECOLE' as const };

export const CONFIG = {
  success: true,
  network: 'Ethereum Sepolia',
  chainId: 11155111,
  contractAddress: '0x309851a5faa5e1f9cd3bb3405c8e97b71bdbd735',
  nftContractAddress: '0x7f8a948522a984a1b5b0605f009a78ef74152e09',
  explorer: 'https://sepolia.etherscan.io',
};
