import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/auth.interceptor';
import { ConfigService } from '../../core/config.service';
import { ToastService } from '../../core/toast.service';
import { DocumentRecord } from '../../models';
import { CONFIG, ELEVE, click, settle, text } from '../../testing';
import { EleveDocumentsPage } from './eleve-documents.page';

const doc = (overrides: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'd1', title: 'Diplôme de Marwa', type: 'DIPLOME', hash: '5f856a651010e152ae9c79aa5d3f7b89a9b5468a358ac1c662dcffe1785185a9', student: ELEVE,
  contractAddress: CONFIG.contractAddress, txHash: '0xabc', blockNumber: 12, blockTime: '2026-10-16T20:28:36Z', createdAt: '2026-10-16T20:29:00Z',
  ...overrides,
});

describe('page Mes documents de l\'eleve', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(ConfigService).config.set(CONFIG);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  async function open(answer: (request: ReturnType<HttpTestingController['expectOne']>) => void) {
    const fixture = TestBed.createComponent(EleveDocumentsPage);
    fixture.detectChanges();
    answer(http.expectOne('/api/me/documents'));
    await settle(fixture);
    return fixture;
  }

  it('montre chaque document remis avec sa preuve : type, date du bloc, empreinte, transaction', async () => {
    const fixture = await open((r) => r.flush({ success: true, documents: [doc(), doc({ id: 'd2', title: 'Relevé S1', type: 'RELEVE', hash: 'b'.repeat(64) })] }));
    const page: HTMLElement = fixture.nativeElement;
    const card = page.querySelector('[data-document="Diplôme de Marwa"]') as HTMLElement;
    expect(text(card)).toContain('Diplôme');
    expect(text(card)).toContain('Prouvé sur la blockchain ✓');
    expect(text(card)).toContain('bloc 12');
    expect(text(card)).toContain('5f856a65…5185a9');
    expect(card.querySelector('[data-action="certificate"]')).not.toBeNull();
    expect((card.querySelector('a[href]') as HTMLAnchorElement).href).toBe('https://sepolia.etherscan.io/tx/0xabc');
    expect(page.querySelectorAll('[data-document]').length).toBe(2);
    expect(text(page, '.field-hint')).toContain('gardez l’original');
  });

  it('sans document, explique d\'ou ils viendront', async () => {
    const fixture = await open((r) => r.flush({ success: true, documents: [] }));
    const page: HTMLElement = fixture.nativeElement;
    expect(text(page, '#noDocuments')).toContain('Aucun document pour le moment');
    expect(page.querySelector('[data-document]')).toBeNull();
  });

  it('une erreur du serveur est montree, pas un faux "aucun document"', async () => {
    const fixture = await open((r) => r.flush({ success: false, message: 'Connexion requise' }, { status: 401, statusText: 'Unauthorized' }));
    const page: HTMLElement = fixture.nativeElement;
    expect(text(page, '.alert-err')).toContain('Connexion requise');
    expect(page.querySelector('#noDocuments')).toBeNull();
  });

  it('le certificat se telecharge depuis la carte', async () => {
    const saved: string[] = [];
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) { saved.push(this.download); });
    const fixture = await open((r) => r.flush({ success: true, documents: [doc()] }));
    const page: HTMLElement = fixture.nativeElement;
    click(page, '[data-action="certificate"]');
    http.expectOne('/api/documents/d1/certificate').flush(new Blob(['%PDF-1.7']), { headers: { 'Content-Disposition': 'attachment; filename="certificat-diplome-de-marwa.pdf"' } });
    await settle(fixture);
    expect(saved).toEqual(['certificat-diplome-de-marwa.pdf']);
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  });
});
