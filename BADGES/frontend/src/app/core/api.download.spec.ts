import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';

describe('ApiService.download', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('rend le fichier et le nom propose par le serveur', async () => {
    const pending = api.download('/api/documents/d1/certificate');
    const request = http.expectOne('/api/documents/d1/certificate');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF'], { type: 'application/pdf' }), { headers: { 'Content-Disposition': 'attachment; filename="certificat-diplome.pdf"' } });
    const result = await pending;
    expect(result.ok).toBeTrue();
    if (result.ok) {
      expect(result.data.filename).toBe('certificat-diplome.pdf');
      expect(await result.data.blob.text()).toBe('%PDF');
    }
  });

  it('prend un nom par defaut quand le serveur n\'en donne pas', async () => {
    const pending = api.download('/x');
    http.expectOne('/x').flush(new Blob(['a']));
    const result = await pending;
    expect(result.ok && result.data.filename).toBe('document.pdf');
  });

  it('relit le message d\'erreur JSON que le serveur envoie sous forme de fichier', async () => {
    const pending = api.download('/x');
    http.expectOne('/x').flush(new Blob([JSON.stringify({ success: false, message: 'Document introuvable' })]), { status: 404, statusText: 'Not Found' });
    const result = await pending;
    if (result.ok) {
      throw new Error('un echec etait attendu');
    }
    expect(result.status).toBe(404);
    expect(result.data['message']).toBe('Document introuvable');
  });

  it('garde un message general quand l\'erreur n\'est pas du JSON', async () => {
    const pending = api.download('/x');
    http.expectOne('/x').flush(new Blob(['<html>oups</html>']), { status: 500, statusText: 'Server Error' });
    const result = await pending;
    if (result.ok) {
      throw new Error('un echec etait attendu');
    }
    expect(result.data['message']).toBe('Réponse inattendue du serveur');
  });

  it('dit que le serveur ne repond pas quand le reseau est coupe', async () => {
    const pending = api.download('/x');
    http.expectOne('/x').error(new ProgressEvent('error'));
    const result = await pending;
    if (result.ok) {
      throw new Error('un echec etait attendu');
    }
    expect(result.status).toBe(0);
    expect(result.data['message']).toContain('ne répond pas');
  });
});
