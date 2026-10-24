import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { JournalService } from '../journal.service';
import { SessionService } from '../session.service';
import { NftStepComponent } from './nft-step.component';

const WALLET = '0x61aa685ca727156af0d49029a49a28e8eac87f80';
const NFT = '0x7f8a948522a984a1b5b0605f009a78ef74152e09';

describe('NftStepComponent', () => {
  let http: HttpTestingController;
  let session: SessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    session.email.set('marwa@example.com');
    session.courseId.set('1');
    session.wallet.set(WALLET);
    session.config.set({ network: 'Ethereum Sepolia', chainId: 11155111, contractAddress: '0x1', nftContractAddress: NFT, explorer: 'https://sepolia.etherscan.io' });
  });

  function render() {
    const fixture = TestBed.createComponent(NftStepComponent);
    fixture.detectChanges();
    return fixture;
  }

  it("cree le badge NFT avec l'e-mail et le cours de la session, et le raconte dans le journal", async () => {
    const fixture = render();
    fixture.nativeElement.querySelector('#btnNft').click();

    const req = http.expectOne('/api/nft-badges/issue');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'marwa@example.com', courseId: '1' });
    req.flush(
      { success: true, badge: { course: 'Introduction à la blockchain', tokenId: 1, contractAddress: NFT, txHash: '0xabcdef0123456789', blockNumber: 5, blockTime: '2026-10-16T21:00:00Z' } },
      { status: 201, statusText: 'Created' },
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(session.done().nft).toBeTrue();
    const entry = TestBed.inject(JournalService).entries()[0];
    expect(entry.kind).toBe('ok');
    const token = entry.facts.find((f) => f.label === 'Jeton n°')!;
    expect(token.text).toBe('1');
    expect(token.href).toBe(`https://sepolia.etherscan.io/nft/${NFT}/1`);
    expect(fixture.nativeElement.querySelector('.num').textContent).toContain('✓');
  });

  it("un doublon (409) n'est pas une erreur : l'etape reste a faire et le journal l'explique", async () => {
    const fixture = render();
    fixture.nativeElement.querySelector('#btnNft').click();
    http.expectOne('/api/nft-badges/issue').flush({ success: false, message: 'Badge NFT deja delivre pour ce cours' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(session.done().nft).toBeFalse();
    const entry = TestBed.inject(JournalService).entries()[0];
    expect(entry.kind).toBe('warn');
    expect(entry.message).toContain('deja delivre');
  });

  it('verifie un jeton : numero, proprietaire et date lus dans le contrat', async () => {
    const fixture = render();
    fixture.nativeElement.querySelector('#btnVerifyNft').click();

    http.expectOne(`/api/nft-badges/verify/${WALLET}/1`).flush({
      success: true,
      valid: true,
      onChain: { walletAddress: WALLET, courseId: 1, tokenId: 1, owner: WALLET, issuedAt: '2026-10-16T21:00:00Z' },
      database: { user: 'marwa', course: 'Introduction à la blockchain', txHash: '0xabc' },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const verdict: HTMLElement = fixture.nativeElement.querySelector('#nftVerdict .verdict');
    expect(verdict.classList).toContain('ok');
    expect(verdict.textContent).toContain('Badge NFT authentique ✓');
    expect(verdict.textContent).toContain('Le jeton n° 1');
  });

  it("annonce qu'aucun jeton n'existe quand le contrat repond valid=false", async () => {
    const fixture = render();
    fixture.nativeElement.querySelector('#btnVerifyNft').click();

    http.expectOne(`/api/nft-badges/verify/${WALLET}/1`).flush({
      success: true,
      valid: false,
      onChain: { walletAddress: WALLET, courseId: 1, tokenId: null, owner: null, issuedAt: null },
      database: null,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const verdict: HTMLElement = fixture.nativeElement.querySelector('#nftVerdict .verdict');
    expect(verdict.classList).toContain('ko');
    expect(verdict.textContent).toContain('Aucun badge NFT trouvé ✗');
  });

  it("sans lien Etherscan sur un reseau local, pas de lien vers la page du jeton", () => {
    session.config.set({ network: 'Réseau local (test)', chainId: 31337, contractAddress: '0x1', nftContractAddress: NFT, explorer: null });
    expect(session.explorerNftUrl(NFT, 1)).toBeUndefined();
  });
});
