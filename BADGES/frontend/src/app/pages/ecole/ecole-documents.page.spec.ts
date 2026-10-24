import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/auth.interceptor';
import { ConfigService } from '../../core/config.service';
import { ToastService } from '../../core/toast.service';
import { DocumentRecord } from '../../models';
import { CONFIG, ELEVE, choose, click, refresh, settle, text, type, waitFor } from '../../testing';
import { EcoleDocumentsPage } from './ecole-documents.page';

const HASH = 'fb0b068c45e4e615f633dd4d37a975daa6a5bcf7669256c33d2bf8c842a23e43'; // SHA-256 de "Contrat v1"

const STUDENT = { ...ELEVE, hasPassword: true, completedCourseIds: [], badgeCourseIds: [], nftCourseIds: [] };

const doc = (overrides: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'd1', title: 'Diplôme de Marwa', type: 'DIPLOME', hash: 'a'.repeat(64), student: ELEVE,
  contractAddress: CONFIG.contractAddress, txHash: '0xabc', blockNumber: 12, blockTime: '2026-10-16T20:28:36Z', createdAt: '2026-10-16T20:29:00Z',
  ...overrides,
});

describe('page Documents de l\'ecole', () => {
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

  async function open(documents: DocumentRecord[] = [], students = [STUDENT]) {
    const fixture = TestBed.createComponent(EcoleDocumentsPage);
    fixture.detectChanges();
    http.expectOne('/api/school/students').flush({ success: true, students });
    http.expectOne('/api/school/documents').flush({ success: true, documents });
    await settle(fixture);
    await refresh(fixture); // laisse ngModel s'initialiser avant qu'on tape
    return fixture;
  }

  /** Remplit le titre et choisit un document : le navigateur calcule l'empreinte de "Contrat v1". */
  async function fill(fixture: Awaited<ReturnType<typeof open>>, title = 'Contrat de stage') {
    const page: HTMLElement = fixture.nativeElement;
    type(page.querySelector('#docTitle'), title);
    type(page.querySelector('#documentText'), 'Contrat v1');
    await waitFor(fixture, () => page.querySelector('#hashValue') !== null);
  }

  const button = (fixture: Awaited<ReturnType<typeof open>>, selector: string) => fixture.nativeElement.querySelector(selector) as HTMLButtonElement;

  describe('registre', () => {
    it('liste les documents emis avec leur destinataire, ou "archive de l\'ecole"', async () => {
      const fixture = await open([doc(), doc({ id: 'd2', title: 'Procès-verbal du jury', type: 'AUTRE', student: null, hash: 'b'.repeat(64) })]);
      const page: HTMLElement = fixture.nativeElement;
      expect(text(page, '#docCount')).toBe('2');
      const first = page.querySelector('[data-document="Diplôme de Marwa"]') as HTMLElement;
      expect(text(first)).toContain('Diplôme');
      expect(text(first)).toContain('marwa');
      expect(text(first)).toContain('marwa@example.com');
      expect(text(first)).toContain('aaaaaaaa…aaaaaa');
      expect(first.querySelector('[data-action="certificate"]')).not.toBeNull();
      expect(text(page.querySelector('[data-document="Procès-verbal du jury"]') as HTMLElement)).toContain('archive de l’école');
    });

    it('un registre vide l\'explique', async () => {
      const fixture = await open([]);
      expect(text(fixture.nativeElement, '#noDocuments')).toContain('Aucun document émis');
      expect(fixture.nativeElement.querySelector('#documentsTable')).toBeNull();
    });

    it('la recherche et le filtre par type retrouvent un document', async () => {
      const fixture = await open([
        doc(),
        doc({ id: 'd2', title: 'Relevé S1', type: 'RELEVE', hash: 'b'.repeat(64) }),
        doc({ id: 'd3', title: 'Attestation de scolarité', type: 'ATTESTATION', student: null, hash: 'c'.repeat(64) }),
      ]);
      const page: HTMLElement = fixture.nativeElement;
      const titles = () => Array.from(page.querySelectorAll('#documentsTable tbody tr')).map((row) => text(row.querySelector('b') as HTMLElement));

      type(page.querySelector('#docSearch'), 'relev');
      await refresh(fixture);
      expect(titles()).toEqual(['Relevé S1']);

      type(page.querySelector('#docSearch'), 'cccc'); // une partie de l'empreinte
      await refresh(fixture);
      expect(titles()).toEqual(['Attestation de scolarité']);

      type(page.querySelector('#docSearch'), '');
      choose(page.querySelector('#docFilterType'), 1); // Diplome
      await refresh(fixture);
      expect(titles()).toEqual(['Diplôme de Marwa']);

      type(page.querySelector('#docSearch'), 'introuvable');
      await refresh(fixture);
      expect(text(page, '#documentsTable tbody')).toContain('Aucun document ne correspond');
    });

    it('une erreur de chargement est montree', async () => {
      const fixture = TestBed.createComponent(EcoleDocumentsPage);
      fixture.detectChanges();
      http.expectOne('/api/school/students').flush({ success: true, students: [] });
      http.expectOne('/api/school/documents').flush({ success: false, message: 'Connexion requise' }, { status: 401, statusText: 'Unauthorized' });
      await settle(fixture);
      expect(text(fixture.nativeElement, '.alert-err')).toContain('Connexion requise');
    });
  });

  describe('emission', () => {
    it('le bouton attend un titre ET un document', async () => {
      const fixture = await open();
      const page: HTMLElement = fixture.nativeElement;
      expect(button(fixture, '#btnIssue').disabled).toBeTrue();

      type(page.querySelector('#docTitle'), 'Contrat de stage');
      await refresh(fixture);
      expect(button(fixture, '#btnIssue').disabled).toBeTrue(); // titre seul : pas assez

      type(page.querySelector('#documentText'), 'Contrat v1');
      await waitFor(fixture, () => page.querySelector('#hashValue') !== null);
      expect(button(fixture, '#btnIssue').disabled).toBeFalse();

      type(page.querySelector('#docTitle'), '   ');
      await refresh(fixture);
      expect(button(fixture, '#btnIssue').disabled).toBeTrue(); // un titre fait d'espaces ne compte pas
    });

    it('demande confirmation, puis envoie SEULEMENT l\'empreinte et les informations du document', async () => {
      const fixture = await open();
      const page: HTMLElement = fixture.nativeElement;
      await fill(fixture, '  Contrat de stage  ');
      choose(page.querySelector('#docType'), 3); // Autre document
      choose(page.querySelector('#docStudent'), 1); // marwa
      await refresh(fixture);

      click(page, '#btnIssue');
      await refresh(fixture);
      expect((page.querySelector('dialog') as HTMLDialogElement).open).toBeTrue();
      expect(text(page, 'dialog')).toContain('publique et permanente');
      expect(text(page, 'dialog')).toContain('Contrat de stage');
      expect(text(page, 'dialog')).toContain('marwa (marwa@example.com)');
      http.expectNone('/api/documents'); // rien n'est envoye avant la confirmation

      click(page, '#btnConfirmIssue');
      const request = http.expectOne('/api/documents');
      expect(request.request.body).toEqual({ title: 'Contrat de stage', type: 'AUTRE', studentId: 3, hash: HASH }); // jamais le texte
      const created = doc({ id: 'd9', title: 'Contrat de stage', type: 'AUTRE', hash: HASH, blockNumber: 9 });
      request.flush({ success: true, document: created, links: { transaction: 'https://sepolia.etherscan.io/tx/0xabc', contract: 'x' } }, { status: 201, statusText: 'Created' });
      await settle(fixture);

      // le resultat, le registre et le formulaire sont a jour
      expect(text(page, '#issueResult')).toContain('« Contrat de stage » est émis');
      expect(text(page, '#issueResult')).toContain('bloc 9');
      expect(page.querySelector('#issueResult ~ .inline-actions [data-action="certificate"]')).not.toBeNull();
      expect(text(page, '#docCount')).toBe('1');
      expect(page.querySelector('[data-document="Contrat de stage"]')).not.toBeNull();
      expect((page.querySelector('#docTitle') as HTMLInputElement).value).toBe('');
      expect(page.querySelector('#hashValue')).toBeNull(); // la saisie du document est videe
      expect(button(fixture, '#btnIssue').disabled).toBeTrue();
      expect(TestBed.inject(ToastService).toasts()[0].href).toBe('https://sepolia.etherscan.io/tx/0xabc');
    });

    it('sans destinataire choisi, le document est une archive de l\'ecole', async () => {
      const fixture = await open();
      const page: HTMLElement = fixture.nativeElement;
      await fill(fixture);
      click(page, '#btnIssue');
      await refresh(fixture);
      expect(text(page, 'dialog')).toContain('Aucun élève (archive de l’école)');
      click(page, '#btnConfirmIssue');
      const request = http.expectOne('/api/documents');
      expect(request.request.body.studentId).toBeNull();
      expect(request.request.body.type).toBe('DIPLOME'); // type par defaut
      request.flush({ success: false, message: 'x' }, { status: 400, statusText: 'Bad Request' });
      await settle(fixture);
    });

    it('annuler la confirmation n\'envoie rien', async () => {
      const fixture = await open();
      await fill(fixture);
      click(fixture.nativeElement, '#btnIssue');
      await refresh(fixture);
      click(fixture.nativeElement, 'dialog .btn-ghost');
      await refresh(fixture);
      http.expectNone('/api/documents');
      expect((fixture.nativeElement.querySelector('dialog') as HTMLDialogElement).open).toBeFalse();
    });

    it('un document deja emis (409) est explique, rien n\'est ajoute au registre', async () => {
      const fixture = await open();
      await fill(fixture);
      click(fixture.nativeElement, '#btnIssue');
      await refresh(fixture);
      click(fixture.nativeElement, '#btnConfirmIssue');
      http.expectOne('/api/documents').flush({ success: false, message: 'Ce document a deja ete emis : son empreinte est deja gravee' }, { status: 409, statusText: 'Conflict' });
      await settle(fixture);
      expect(TestBed.inject(ToastService).toasts()[0].text).toContain('Rien n’a été envoyé sur la blockchain');
      expect(text(fixture.nativeElement, '#docCount')).toBe('0');
      expect(fixture.nativeElement.querySelector('#issueResult')).toBeNull();
      expect((fixture.nativeElement.querySelector('#docTitle') as HTMLInputElement).value).toBe('Contrat de stage'); // on peut corriger et recommencer
    });

    it('"Deja prouve ?" dit si l\'empreinte est deja gravee', async () => {
      const fixture = await open();
      await fill(fixture);
      click(fixture.nativeElement, '#btnVerify');
      http.expectOne('/api/proofs/hash/verify').flush({ success: true, valid: false, computedHash: HASH, anchoredAt: null });
      await settle(fixture);
      expect(text(fixture.nativeElement, '.verdict')).toContain('Pas encore gravé');
    });
  });

  describe('certificat', () => {
    /** Intercepte le telechargement : on ne veut pas que le navigateur de test enregistre un fichier. */
    function captureDownload() {
      const saved: { name: string; href: string }[] = [];
      spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
        saved.push({ name: this.download, href: this.href });
      });
      return saved;
    }

    it('telecharge le PDF avec le nom donne par le serveur', async () => {
      const saved = captureDownload();
      const fixture = await open([doc()]);
      click(fixture.nativeElement, '[data-document="Diplôme de Marwa"] [data-action="certificate"]');
      const request = http.expectOne('/api/documents/d1/certificate');
      expect(request.request.method).toBe('GET');
      expect(request.request.responseType).toBe('blob');
      request.flush(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), { headers: { 'Content-Disposition': 'attachment; filename="certificat-diplome-de-marwa.pdf"' } });
      await settle(fixture);
      expect(saved.length).toBe(1);
      expect(saved[0].name).toBe('certificat-diplome-de-marwa.pdf');
      expect(saved[0].href).toMatch(/^blob:/);
    });

    it('un refus du serveur est affiche avec son message, sans telechargement', async () => {
      const saved = captureDownload();
      const fixture = await open([doc()]);
      click(fixture.nativeElement, '[data-action="certificate"]');
      http.expectOne('/api/documents/d1/certificate').flush(
        new Blob([JSON.stringify({ success: false, message: 'Ce document ne vous appartient pas' })], { type: 'application/json' }),
        { status: 403, statusText: 'Forbidden' });
      await waitFor(fixture, () => TestBed.inject(ToastService).toasts().length > 0); // le message est relu dans le fichier d'erreur, de facon asynchrone
      expect(saved).toEqual([]);
      expect(TestBed.inject(ToastService).toasts()[0].text).toBe('Ce document ne vous appartient pas');
    });
  });
});
