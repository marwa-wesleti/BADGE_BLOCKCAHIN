import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withHashLocation } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { TokenStore } from './core/token.store';
import { CONFIG, ECOLE, ELEVE, refresh, settle, text } from './testing';

/** L'application entiere : routes, gardes et mises en page, avec un faux serveur. */
describe('application', () => {
  let http: HttpTestingController;
  let router: Router;

  async function start(token: string | null = null, user: typeof ECOLE | typeof ELEVE | null = null) {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withHashLocation()), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    if (token) {
      TestBed.inject(TokenStore).set(token);
    }
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('/api/config').flush(CONFIG);
    if (token) {
      http.expectOne('/api/me').flush(user ? { success: true, user, badges: [], nftBadges: [] } : { success: false, message: 'Connexion requise' }, user ? { status: 200, statusText: 'OK' } : { status: 401, statusText: 'Unauthorized' });
    }
    await settle(fixture);
    return fixture;
  }

  afterEach(() => {
    sessionStorage.clear();
  });

  it('un visiteur voit l\'accueil public avec les liens de connexion et de verification', async () => {
    const fixture = await start();
    await router.navigateByUrl('/');
    await refresh(fixture);
    const page: HTMLElement = fixture.nativeElement;
    expect(text(page, 'h1')).toContain('personne ne peut falsifier');
    expect(page.querySelector('#ctaConnexion')).not.toBeNull();
    expect(page.querySelector('#ctaVerifier')).not.toBeNull();
    expect(text(page, '.site-footer')).toContain('Ethereum Sepolia');
    http.verify();
  });

  it('un visiteur qui tente l\'espace ecole est renvoye a la connexion', async () => {
    const fixture = await start();
    await router.navigateByUrl('/ecole/eleves');
    await refresh(fixture);
    expect(TestBed.inject(Location).path()).toContain('/connexion');
    expect(TestBed.inject(Location).path()).toContain('retour=%2Fecole%2Feleves');
    http.verify();
  });

  it('un eleve qui tente l\'espace ecole est renvoye vers son espace', async () => {
    const fixture = await start('jeton', ELEVE);
    await router.navigateByUrl('/ecole');
    await refresh(fixture);
    http.expectOne('/api/me').flush({ success: true, user: { ...ELEVE, completedCourses: [] }, badges: [], nftBadges: [] });
    await settle(fixture);
    expect(TestBed.inject(Location).path()).toContain('/eleve/mon-espace');
    http.verify();
  });

  it('un jeton perime est oublie au rechargement : la personne est consideree comme deconnectee', async () => {
    const fixture = await start('jeton-perime', null);
    await router.navigateByUrl('/eleve');
    await refresh(fixture);
    expect(TestBed.inject(Location).path()).toContain('/connexion');
    expect(TestBed.inject(TokenStore).token()).toBeNull();
    http.verify();
  });

  it('l\'ecole connectee arrive sur son tableau de bord, avec son menu', async () => {
    const fixture = await start('jeton', ECOLE);
    await router.navigateByUrl('/ecole');
    await refresh(fixture);
    http.expectOne('/api/school/overview').flush({ success: true, students: 0, courses: 0, completions: 0, badges: 0, nftBadges: 0, contractAddress: CONFIG.contractAddress, nftContractAddress: CONFIG.nftContractAddress });
    http.expectOne('/api/school/wallet').flush({ success: true, address: ECOLE.walletAddress, balanceEth: '1' });
    await settle(fixture);
    const page: HTMLElement = fixture.nativeElement;
    expect(TestBed.inject(Location).path()).toContain('/ecole/tableau-de-bord');
    expect(text(page, '.sidebar')).toContain('Élèves');
    expect(text(page, '.sidebar')).toContain('Documents');
    expect(text(page, '.user-card')).toContain('ecole');
    http.verify();
  });

  it('un utilisateur connecte n\'a plus rien a faire sur la page de connexion', async () => {
    const fixture = await start('jeton', ELEVE);
    await router.navigateByUrl('/connexion');
    await refresh(fixture);
    http.expectOne('/api/me').flush({ success: true, user: { ...ELEVE, completedCourses: [] }, badges: [], nftBadges: [] });
    await settle(fixture);
    expect(TestBed.inject(Location).path()).toContain('/eleve');
    http.verify();
  });

  it('une adresse inconnue ramene a l\'accueil', async () => {
    const fixture = await start();
    await router.navigateByUrl('/n-importe-quoi');
    await refresh(fixture);
    expect(router.url).toBe('/');
    http.verify();
  });

  it('la verification publique reste ouverte sans connexion', async () => {
    const fixture = await start();
    await router.navigateByUrl('/verifier');
    await refresh(fixture);
    expect(text(fixture.nativeElement, 'h1')).toContain('Vérifier un badge');
    http.verify();
  });
});
