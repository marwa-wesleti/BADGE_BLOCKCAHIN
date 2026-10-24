import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { SILENT_401 } from './http-context';
import { TokenStore } from './token.store';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let tokens: TokenStore;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStore);
    auth = TestBed.inject(AuthService);
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('ajoute le jeton aux appels de notre API', () => {
    tokens.set('abc');
    client.get('/api/courses').subscribe();
    expect(http.expectOne('/api/courses').request.headers.get('Authorization')).toBe('Bearer abc');
  });

  it('n\'ajoute rien quand personne n\'est connecte', () => {
    client.get('/api/config').subscribe();
    expect(http.expectOne('/api/config').request.headers.has('Authorization')).toBeFalse();
  });

  it('n\'envoie JAMAIS le jeton a un autre site', () => {
    tokens.set('secret');
    client.get('https://autre-site.example/api/courses').subscribe();
    expect(http.expectOne('https://autre-site.example/api/courses').request.headers.has('Authorization')).toBeFalse();
  });

  it('un 401 alors qu\'on est connecte termine la session', () => {
    tokens.set('perime');
    spyOn(auth, 'expire').and.callThrough();
    client.get('/api/me').subscribe({ error: () => undefined });
    http.expectOne('/api/me').flush({ success: false }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.expire).toHaveBeenCalled();
  });

  it('un 401 sur la connexion est une erreur de saisie : la session n\'est pas touchee', () => {
    tokens.set('encore-valide');
    spyOn(auth, 'expire');
    client.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    http.expectOne('/api/auth/login').flush({ success: false }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.expire).not.toHaveBeenCalled();
  });

  it('un appel marque silencieux (restauration au chargement) ne declenche pas "session expiree"', () => {
    tokens.set('perime');
    spyOn(auth, 'expire');
    client.get('/api/me', { context: new HttpContext().set(SILENT_401, true) }).subscribe({ error: () => undefined });
    http.expectOne('/api/me').flush({ success: false }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.expire).not.toHaveBeenCalled();
  });

  it('un 403 "mot de passe a changer" renvoie vers la page de changement, sans deconnecter', () => {
    tokens.set('valide');
    spyOn(auth, 'expire');
    spyOn(auth, 'requirePasswordChange');
    client.get('/api/courses').subscribe({ error: () => undefined });
    http.expectOne('/api/courses').flush({ success: false, passwordChangeRequired: true }, { status: 403, statusText: 'Forbidden' });
    expect(auth.requirePasswordChange).toHaveBeenCalled();
    expect(auth.expire).not.toHaveBeenCalled();
  });

  it('un 403 ordinaire ne renvoie pas vers le changement de mot de passe', () => {
    tokens.set('valide');
    spyOn(auth, 'requirePasswordChange');
    client.get('/api/school/students').subscribe({ error: () => undefined });
    http.expectOne('/api/school/students').flush({ success: false, message: "Action reservee a l'ecole" }, { status: 403, statusText: 'Forbidden' });
    expect(auth.requirePasswordChange).not.toHaveBeenCalled();
  });

  it('un 403 ne deconnecte pas : on est connecte, simplement pas autorise', () => {
    tokens.set('valide');
    spyOn(auth, 'expire');
    client.get('/api/school/students').subscribe({ error: () => undefined });
    http.expectOne('/api/school/students').flush({ success: false }, { status: 403, statusText: 'Forbidden' });
    expect(auth.expire).not.toHaveBeenCalled();
  });
});
