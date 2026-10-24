import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { authInterceptor } from '../../core/auth.interceptor';
import { ConfigService } from '../../core/config.service';
import { CONFIG, click, refresh, settle, text, type, waitFor } from '../../testing';
import { VerifyPage } from './verify.page';

const WALLET = '0x61aa685ca727156af0d49029a49a28e8eac87f80';
const HASH_CONTRAT_V1 = 'fb0b068c45e4e615f633dd4d37a975daa6a5bcf7669256c33d2bf8c842a23e43'; // meme valeur que ProofService.sha256("Contrat v1")

describe('VerifyPage', () => {
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function setup(query: Record<string, string> = {}) {
    sessionStorage.clear();
    params = new BehaviorSubject(convertToParamMap(query));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(ConfigService).config.set(CONFIG);
    const fixture = TestBed.createComponent(VerifyPage);
    fixture.detectChanges();
    await refresh(fixture); // laisse ngModel s'initialiser avant qu'on tape
    return fixture;
  }

  /** Remplit le formulaire et l'envoie. Une requete est partie (si les saisies sont valides) : au test d'y repondre. */
  async function verifyBadge(fixture: Awaited<ReturnType<typeof setup>>, wallet: string, course: string) {
    type(fixture.nativeElement.querySelector('#wallet'), wallet);
    type(fixture.nativeElement.querySelector('#courseId'), course);
    click(fixture.nativeElement, '#btnVerifyBadge');
    await refresh(fixture);
  }

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('refuse une adresse invalide avant tout appel', async () => {
    const fixture = await setup();
    await verifyBadge(fixture, 'pas-une-adresse', '1');
    expect(text(fixture.nativeElement, '.alert-err')).toContain('Adresse invalide');
    http.expectNone((r) => r.url.includes('/verify/'));
  });

  it('refuse un numero de cours invalide', async () => {
    const fixture = await setup();
    for (const course of ['0', 'abc', '-1', '1.5', '']) {
      await verifyBadge(fixture, WALLET, course);
      expect(text(fixture.nativeElement, '.alert-err')).toContain('numéro du cours');
    }
    http.expectNone((r) => r.url.includes('/verify/'));
  });

  it('un badge existant : verdict vert, date lue dans le contrat, et lien a partager', async () => {
    const fixture = await setup();
    await verifyBadge(fixture, WALLET, '1');
    http.expectOne(`/api/badges/verify/${WALLET}/1`).flush({
      success: true, valid: true,
      onChain: { walletAddress: WALLET, courseId: 1, issuedAt: '2026-10-16T19:28:36Z' },
      database: { user: 'marwa', course: 'Introduction à la blockchain' },
    });
    await settle(fixture);

    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('.verdict.ok')).not.toBeNull();
    expect(text(page, '.verdict')).toContain('Badge authentique ✓');
    expect(text(page, '.kv')).toContain('marwa');
    expect(page.querySelector('#copyShare')).not.toBeNull(); // un lien de verification est propose
  });

  it('un badge inconnu : verdict rouge, pas de lien a partager', async () => {
    const fixture = await setup();
    await verifyBadge(fixture, WALLET, '2');
    http.expectOne(`/api/badges/verify/${WALLET}/2`).flush({ success: true, valid: false, onChain: { walletAddress: WALLET, courseId: 2, issuedAt: null }, database: null });
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.verdict.ko')).not.toBeNull();
    expect(text(fixture.nativeElement, '.verdict')).toContain('Aucun badge trouvé ✗');
    expect(fixture.nativeElement.querySelector('#copyShare')).toBeNull();
  });

  it('l\'onglet NFT interroge le contrat NFT et montre le jeton et son proprietaire', async () => {
    const fixture = await setup();
    click(fixture.nativeElement, '#tabNft');
    await refresh(fixture);
    await verifyBadge(fixture, WALLET, '1');
    http.expectOne(`/api/nft-badges/verify/${WALLET}/1`).flush({
      success: true, valid: true,
      onChain: { walletAddress: WALLET, courseId: 1, tokenId: 7, owner: WALLET, issuedAt: '2026-10-16T21:38:24Z' },
      database: null,
    });
    await settle(fixture);
    expect(text(fixture.nativeElement, '.verdict')).toContain('Badge NFT authentique ✓');
    expect(text(fixture.nativeElement, '.kv')).toContain('7');
    expect(text(fixture.nativeElement, '.kv')).toContain(WALLET);
  });

  it('une erreur du serveur n\'est pas presentee comme "badge inconnu"', async () => {
    const fixture = await setup();
    await verifyBadge(fixture, WALLET, '1');
    http.expectOne(`/api/badges/verify/${WALLET}/1`).flush({ success: false, message: 'Blockchain indisponible' }, { status: 502, statusText: 'Bad Gateway' });
    await settle(fixture);
    expect(text(fixture.nativeElement, '.verdict')).toContain('Vérification impossible');
    expect(text(fixture.nativeElement, '.verdict')).toContain('Blockchain indisponible');
  });

  it('document : l\'empreinte est calculee dans le navigateur et seule elle est envoyee', async () => {
    const fixture = await setup();
    click(fixture.nativeElement, '#tabDocument');
    await refresh(fixture);
    type(fixture.nativeElement.querySelector('#documentText'), 'Contrat v1');
    await waitFor(fixture, () => text(fixture.nativeElement, '#hashValue') !== '');
    expect(text(fixture.nativeElement, '#hashValue')).toBe(HASH_CONTRAT_V1);

    click(fixture.nativeElement, '#btnVerifyDoc');
    await refresh(fixture);
    const request = http.expectOne('/api/proofs/hash/verify');
    expect(request.request.body).toEqual({ hash: HASH_CONTRAT_V1 }); // jamais le texte
    request.flush({ success: true, valid: true, computedHash: HASH_CONTRAT_V1, anchoredAt: '2026-10-16T21:07:00Z' });
    await settle(fixture);
    expect(text(fixture.nativeElement, '.verdict')).toContain('Document intact ✓');
  });

  it('document : le bouton attend qu\'il y ait une empreinte', async () => {
    const fixture = await setup();
    click(fixture.nativeElement, '#tabDocument');
    await refresh(fixture);
    expect((fixture.nativeElement.querySelector('#btnVerifyDoc') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('un lien partage lance la verification tout de suite', async () => {
    const fixture = await setup({ type: 'nft', adresse: WALLET, cours: '3' });
    http.expectOne(`/api/nft-badges/verify/${WALLET}/3`).flush({
      success: true, valid: true,
      onChain: { walletAddress: WALLET, courseId: 3, tokenId: 1, owner: WALLET, issuedAt: '2026-10-16T21:38:24Z' },
      database: null,
    });
    await settle(fixture);
    expect(text(fixture.nativeElement, '.verdict')).toContain('Badge NFT authentique ✓');
    expect((fixture.nativeElement.querySelector('#wallet') as HTMLInputElement).value).toBe(WALLET);
  });

  describe('lien d\'un certificat de document (QR code)', () => {
    async function openLink() {
      const fixture = await setup({ type: 'document', hash: HASH_CONTRAT_V1.toUpperCase() });
      const first = http.expectOne('/api/proofs/hash/verify');
      expect(first.request.body).toEqual({ hash: HASH_CONTRAT_V1 }); // normalise en minuscules
      first.flush({ success: true, valid: true, computedHash: HASH_CONTRAT_V1, anchoredAt: '2026-10-16T21:07:00Z' });
      await settle(fixture);
      return fixture;
    }

    async function chooseText(fixture: Awaited<ReturnType<typeof setup>>, content: string) {
      type(fixture.nativeElement.querySelector('#documentText'), content);
      await waitFor(fixture, () => text(fixture.nativeElement, '#hashValue') !== '');
      click(fixture.nativeElement, '#btnVerifyDoc');
      await refresh(fixture);
    }

    it('ouvre l\'onglet Document et dit tout de suite si l\'empreinte du lien est gravee', async () => {
      const fixture = await openLink();
      expect(text(fixture.nativeElement, '.verdict')).toContain('Empreinte gravée ✓');
      expect(text(fixture.nativeElement, '#linkedHash')).toContain('fb0b068c…a23e43');
      expect(fixture.nativeElement.querySelector('#tabDocument.active')).not.toBeNull();
    });

    it('le fichier qui correspond a l\'empreinte du lien est declare intact', async () => {
      const fixture = await openLink();
      await chooseText(fixture, 'Contrat v1');
      http.expectOne('/api/proofs/hash/verify').flush({ success: true, valid: true, computedHash: HASH_CONTRAT_V1, anchoredAt: '2026-10-16T21:07:00Z' });
      await settle(fixture);
      expect(text(fixture.nativeElement, '.verdict')).toContain('Document intact ✓');
    });

    it('un autre fichier est refuse : ce n\'est pas celui du certificat, meme si ce fichier avait ete grave', async () => {
      const fixture = await openLink();
      await chooseText(fixture, 'Contrat v2');
      http.expectOne('/api/proofs/hash/verify').flush({ success: true, valid: true, computedHash: 'e'.repeat(64), anchoredAt: '2026-10-17T08:00:00Z' });
      await settle(fixture);
      expect(text(fixture.nativeElement, '.verdict')).toContain('Ce fichier n’est pas celui du certificat ✗');
      expect(fixture.nativeElement.querySelector('.verdict.ko')).not.toBeNull();
    });

    it('une empreinte inconnue est signalee en rouge', async () => {
      const fixture = await setup({ type: 'document', hash: 'a'.repeat(64) });
      http.expectOne('/api/proofs/hash/verify').flush({ success: true, valid: false, computedHash: 'a'.repeat(64), anchoredAt: null });
      await settle(fixture);
      expect(text(fixture.nativeElement, '.verdict')).toContain('Empreinte inconnue ✗');
    });

    it('un lien dont l\'empreinte est mal formee n\'interroge pas le serveur', async () => {
      const fixture = await setup({ type: 'document', hash: 'pas-une-empreinte' });
      http.expectNone('/api/proofs/hash/verify');
      expect(fixture.nativeElement.querySelector('#linkedHash')).toBeNull();
      expect(fixture.nativeElement.querySelector('#tabDocument.active')).not.toBeNull();
    });
  });

  it('ouvrir un autre lien partage sur la meme page relance la verification', async () => {
    const fixture = await setup({ type: 'registre', adresse: WALLET, cours: '1' });
    http.expectOne(`/api/badges/verify/${WALLET}/1`).flush({
      success: true, valid: true, onChain: { walletAddress: WALLET, courseId: 1, issuedAt: '2026-10-16T21:38:24Z' }, database: null,
    });
    await settle(fixture);
    expect(text(fixture.nativeElement, '.verdict')).toContain('Badge authentique ✓');

    // le composant est reutilise par le routeur : seuls les parametres changent
    params.next(convertToParamMap({ type: 'nft', adresse: WALLET, cours: '2' }));
    await refresh(fixture);
    http.expectOne(`/api/nft-badges/verify/${WALLET}/2`).flush({ success: true, valid: false, onChain: null, database: null });
    await settle(fixture);
    expect(text(fixture.nativeElement, '.verdict')).toContain('Aucun badge NFT trouvé ✗');
  });
});
