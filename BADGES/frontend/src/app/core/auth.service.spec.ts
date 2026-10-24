import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { ToastService } from './toast.service';
import { TokenStore } from './token.store';

const ELEVE = { id: 3, username: 'marwa', email: 'marwa@example.com', walletAddress: '0x61aa', role: 'ELEVE' as const };
const ECOLE = { id: 1, username: 'ecole', email: 'ecole@example.com', walletAddress: '0x8101', role: 'ECOLE' as const };

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let tokens: TokenStore;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStore);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('une connexion reussie garde le jeton et le profil, et oriente vers le bon espace', async () => {
    const pending = auth.login('marwa@example.com', 'motdepasse1');
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ email: 'marwa@example.com', password: 'motdepasse1' });
    request.flush({ success: true, token: 'jeton-123', user: ELEVE });
    const result = await pending;

    expect(result.ok).toBeTrue();
    expect(tokens.token()).toBe('jeton-123');
    expect(auth.user()?.username).toBe('marwa');
    expect(auth.homeUrl()).toBe('/eleve');
    expect(sessionStorage.getItem('badges.token')).toBe('jeton-123');
  });

  describe('mot de passe temporaire', () => {
    const TEMPORAIRE = { ...ELEVE, mustChangePassword: true };

    it('une connexion avec un mot de passe temporaire oriente vers le changement obligatoire', async () => {
      const pending = auth.login('marwa@example.com', 'Tmp12345abcd');
      http.expectOne('/api/auth/login').flush({ success: true, token: 't', user: TEMPORAIRE });
      await pending;
      expect(auth.mustChangePassword()).toBeTrue();
      expect(auth.homeUrl()).toBe('/mot-de-passe');
    });

    it("changer son mot de passe leve l'obligation et renvoie vers l'espace eleve", async () => {
      auth.user.set(TEMPORAIRE);
      const pending = auth.changePassword('Tmp12345abcd', 'MonNouveauMdp9');
      const request = http.expectOne('/api/auth/change-password');
      expect(request.request.body).toEqual({ currentPassword: 'Tmp12345abcd', newPassword: 'MonNouveauMdp9' });
      request.flush({ success: true, user: { ...ELEVE, mustChangePassword: false } });
      expect((await pending).ok).toBeTrue();
      expect(auth.mustChangePassword()).toBeFalse();
      expect(auth.homeUrl()).toBe('/eleve');
    });

    it("un changement refuse laisse l'obligation en place", async () => {
      auth.user.set(TEMPORAIRE);
      const pending = auth.changePassword('faux', 'MonNouveauMdp9');
      http.expectOne('/api/auth/change-password').flush({ success: false, message: 'x' }, { status: 401, statusText: 'Unauthorized' });
      expect((await pending).ok).toBeFalse();
      expect(auth.mustChangePassword()).toBeTrue();
    });

    it("si l'ecole reinitialise le mot de passe pendant la session : on previent et on renvoie vers le changement", () => {
      auth.user.set(ELEVE);
      auth.requirePasswordChange();
      expect(auth.mustChangePassword()).toBeTrue();
      expect(TestBed.inject(ToastService).toasts()[0].text).toContain('réinitialisé');
      expect(router.navigateByUrl).toHaveBeenCalledWith('/mot-de-passe');
    });

    it("restaurer une session au mot de passe temporaire (rechargement de page) garde l'obligation", async () => {
      tokens.set('jeton');
      const pending = auth.ready();
      http.expectOne('/api/me').flush({ success: true, user: TEMPORAIRE, badges: [], nftBadges: [] });
      await pending;
      expect(auth.mustChangePassword()).toBeTrue();
    });
  });

  it('le compte ecole est oriente vers l\'espace ecole', async () => {
    const pending = auth.login('ecole@example.com', 'x');
    http.expectOne('/api/auth/login').flush({ success: true, token: 't', user: ECOLE });
    await pending;
    expect(auth.role()).toBe('ECOLE');
    expect(auth.homeUrl()).toBe('/ecole');
  });

  it('un mauvais mot de passe (401) ne connecte personne et ne ressemble pas a une session expiree', async () => {
    const toasts = TestBed.inject(ToastService);
    const pending = auth.login('marwa@example.com', 'faux');
    http.expectOne('/api/auth/login').flush({ success: false, message: 'E-mail ou mot de passe incorrect' }, { status: 401, statusText: 'Unauthorized' });
    const result = await pending;

    expect(result.ok).toBeFalse();
    expect(result.status).toBe(401);
    expect(auth.user()).toBeNull();
    expect(tokens.token()).toBeNull();
    expect(toasts.toasts().length).toBe(0); // pas de "session expiree" pour une simple erreur de saisie
  });

  it('l\'inscription connecte aussi et renvoie la cle privee une seule fois', async () => {
    const pending = auth.register('marwa', 'marwa@example.com', 'motdepasse1');
    http.expectOne('/api/auth/register').flush({ success: true, token: 'jeton', user: ELEVE, privateKey: 'cle-privee' }, { status: 201, statusText: 'Created' });
    const result = await pending;
    expect(result.ok).toBeTrue();
    if (result.ok) {
      expect(result.data.privateKey).toBe('cle-privee');
    }
    expect(auth.isLoggedIn()).toBeTrue();
  });

  it('la deconnexion efface tout et revient a l\'accueil', async () => {
    const pending = auth.login('marwa@example.com', 'x');
    http.expectOne('/api/auth/login').flush({ success: true, token: 't', user: ELEVE });
    await pending;

    auth.logout();
    expect(auth.user()).toBeNull();
    expect(tokens.token()).toBeNull();
    expect(sessionStorage.getItem('badges.token')).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('au rechargement, un jeton valide restaure la session', async () => {
    tokens.set('jeton-existant');
    const ready = auth.ready();
    const request = http.expectOne('/api/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton-existant');
    request.flush({ success: true, user: ELEVE, badges: [], nftBadges: [] });
    await ready;
    expect(auth.user()?.email).toBe('marwa@example.com');
  });

  it('au rechargement, un jeton refuse est oublie sans message et sans changer de page', async () => {
    tokens.set('jeton-perime');
    const ready = auth.ready();
    http.expectOne('/api/me').flush({ success: false, message: 'Connexion requise' }, { status: 401, statusText: 'Unauthorized' });
    await ready;
    expect(auth.user()).toBeNull();
    expect(tokens.token()).toBeNull();
    expect(TestBed.inject(ToastService).toasts().length).toBe(0);
    expect(router.navigateByUrl).not.toHaveBeenCalled(); // un visiteur sur l'accueil n'est pas renvoye vers la connexion
  });

  it('sans jeton, aucune requete n\'est envoyee au demarrage', async () => {
    await auth.ready();
    http.expectNone('/api/me');
    expect(auth.user()).toBeNull();
  });

  it('une session expiree ramene a la connexion avec une explication', async () => {
    const toasts = TestBed.inject(ToastService);
    const pending = auth.login('marwa@example.com', 'x');
    http.expectOne('/api/auth/login').flush({ success: true, token: 't', user: ELEVE });
    await pending;

    auth.expire();
    expect(auth.user()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/connexion');
    expect(toasts.toasts()[0].text).toContain('expiré');
    // et ne se repete pas si plus personne n'est connecte
    auth.expire();
    expect(toasts.toasts().length).toBe(1);
  });
});
