import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { SessionService } from './session.service';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  async function render() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('/api/config').flush({
      success: true,
      network: 'Ethereum Sepolia',
      chainId: 11155111,
      contractAddress: '0x309851a5faa5e1f9cd3bb3405c8e97b71bdbd735',
      nftContractAddress: '0x7f8a948522a984a1b5b0605f009a78ef74152e09',
      explorer: 'https://sepolia.etherscan.io',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('affiche les 5 etapes, le reseau et un lien vers chaque contrat', async () => {
    const fixture = await render();
    const page: HTMLElement = fixture.nativeElement;

    expect(page.querySelectorAll('.step').length).toBe(5);
    expect(page.querySelector('#pills')!.textContent).toContain('Ethereum Sepolia');
    const links = Array.from(page.querySelectorAll<HTMLAnchorElement>('#pills a')).map((a) => a.href);
    expect(links).toEqual([
      'https://sepolia.etherscan.io/address/0x309851a5faa5e1f9cd3bb3405c8e97b71bdbd735',
      'https://sepolia.etherscan.io/address/0x7f8a948522a984a1b5b0605f009a78ef74152e09',
    ]);
    expect(page.querySelector('#pills')!.textContent).toContain('Contrat NFT');
    expect(page.querySelector('#emptyJournal')).not.toBeNull();
  });

  it('met en avant la premiere etape non terminee', async () => {
    const fixture = await render();
    const session = TestBed.inject(SessionService);
    const steps = () => Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.step'));

    expect(steps().map((s) => s.classList.contains('active'))).toEqual([true, false, false, false, false]);

    session.markDone('register');
    fixture.detectChanges();
    expect(steps().map((s) => s.classList.contains('done'))).toEqual([true, false, false, false, false]);
    expect(steps().map((s) => s.classList.contains('active'))).toEqual([false, true, false, false, false]);
  });

  it("met en avant l'etape NFT quand les 4 premieres sont terminees", async () => {
    const fixture = await render();
    const session = TestBed.inject(SessionService);
    (['register', 'complete', 'issue', 'anchor'] as const).forEach((step) => session.markDone(step));
    fixture.detectChanges();

    const active = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.step')).map((s) => s.classList.contains('active'));
    expect(active).toEqual([false, false, false, false, true]);
  });

  it('sans lien Etherscan sur un reseau local', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('/api/config').flush({ success: true, network: 'Réseau local (test)', chainId: 31337, contractAddress: '0x5fbdb2315678afecb367f032d93f642f64180aa3', explorer: null });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#pills a')).toBeNull();
  });
});
