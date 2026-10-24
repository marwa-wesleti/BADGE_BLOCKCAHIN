import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renvoie le corps d\'une reponse reussie', async () => {
    const pending = api.call('POST', '/api/courses', { title: 't' });
    const request = http.expectOne('/api/courses');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ title: 't' });
    request.flush({ success: true }, { status: 201, statusText: 'Created' });
    expect(await pending).toEqual({ status: 201, ok: true, data: { success: true } });
  });

  it('un refus (409) n\'est pas une exception : on recupere le message du serveur', async () => {
    const pending = api.call('POST', '/api/badges/issue', {});
    http.expectOne('/api/badges/issue').flush({ success: false, message: 'Badge deja delivre pour ce cours' }, { status: 409, statusText: 'Conflict' });
    const result = await pending;
    expect(result.ok).toBeFalse();
    expect(result.status).toBe(409);
    expect(result.data['message']).toBe('Badge deja delivre pour ce cours');
  });

  it('serveur eteint : status 0 et un message comprehensible', async () => {
    const pending = api.call('GET', '/api/config');
    http.expectOne('/api/config').error(new ProgressEvent('error'));
    const result = await pending;
    expect(result.status).toBe(0);
    expect(result.data['message']).toContain('ne répond pas');
  });
});
