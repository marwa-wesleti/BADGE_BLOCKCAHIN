import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/auth.interceptor';
import { ToastService } from '../../core/toast.service';
import { ECOLE, ELEVE, click, refresh, settle, text, type } from '../../testing';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let http: HttpTestingController;
  let router: Router;

  async function setup(query: Record<string, string> = {}) {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    await refresh(fixture); // laisse ngModel s'initialiser avant qu'on tape
    return fixture;
  }

  /** Remplit le formulaire et l'envoie. La requete est partie : au test d'y repondre. */
  async function submit(fixture: Awaited<ReturnType<typeof setup>>, email: string, password: string) {
    const page: HTMLElement = fixture.nativeElement;
    type(page.querySelector('#email'), email);
    type(page.querySelector('#password'), password);
    click(page, '#btnLogin');
    await refresh(fixture);
  }

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('des champs vides sont refuses sans appeler le serveur', async () => {
    const fixture = await setup();
    click(fixture.nativeElement, '#btnLogin');
    await refresh(fixture);
    expect(text(fixture.nativeElement, '#loginError')).toContain('Saisissez votre e-mail');
    http.expectNone('/api/auth/login');
  });

  it('un mauvais mot de passe affiche un message clair et vide le champ', async () => {
    const fixture = await setup();
    await submit(fixture, 'marwa@example.com', 'faux');
    http.expectOne('/api/auth/login').flush({ success: false, message: 'E-mail ou mot de passe incorrect' }, { status: 401, statusText: 'Unauthorized' });
    await settle(fixture);
    expect(text(fixture.nativeElement, '#loginError')).toBe('E-mail ou mot de passe incorrect.');
    expect((fixture.nativeElement.querySelector('#password') as HTMLInputElement).value).toBe('');
  });

  it('trop de tentatives (429) : on l\'explique', async () => {
    const fixture = await setup();
    await submit(fixture, 'marwa@example.com', 'faux');
    http.expectOne('/api/auth/login').flush({ success: false, message: 'Trop' }, { status: 429, statusText: 'Too Many Requests' });
    await settle(fixture);
    expect(text(fixture.nativeElement, '#loginError')).toContain('Trop de tentatives');
  });

  it('serveur eteint : message comprehensible', async () => {
    const fixture = await setup();
    await submit(fixture, 'marwa@example.com', 'x');
    http.expectOne('/api/auth/login').error(new ProgressEvent('error'));
    await settle(fixture);
    expect(text(fixture.nativeElement, '#loginError')).toContain('ne répond pas');
  });

  it('un eleve connecte arrive dans son espace', async () => {
    const fixture = await setup();
    await submit(fixture, 'marwa@example.com', 'motdepasse1');
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ email: 'marwa@example.com', password: 'motdepasse1' });
    request.flush({ success: true, token: 't', user: ELEVE });
    await settle(fixture);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/eleve');
  });

  it('un eleve connecte avec un mot de passe temporaire est envoye choisir le sien, pas dans son espace', async () => {
    const fixture = await setup({ retour: '/eleve/documents' });
    await submit(fixture, 'marwa@example.com', 'Tmp12345abcd');
    http.expectOne('/api/auth/login').flush({ success: true, token: 't', user: { ...ELEVE, mustChangePassword: true } });
    await settle(fixture);
    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/mot-de-passe'); // meme avec une page de retour : le changement passe avant
    expect(TestBed.inject(ToastService).toasts()[0].text).toContain('temporaire');
  });

  it('un compte ecole arrive dans l\'espace ecole, et on le dit si l\'onglet choisi etait Eleve', async () => {
    const fixture = await setup();
    const toasts = TestBed.inject(ToastService);
    await submit(fixture, 'ecole@example.com', 'x');
    http.expectOne('/api/auth/login').flush({ success: true, token: 't', user: ECOLE });
    await settle(fixture);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/ecole');
    expect(toasts.toasts()[0].text).toContain('compte école');
  });

  it('l\'onglet Ecole explique qu\'il n\'y a pas d\'inscription ecole', async () => {
    const fixture = await setup();
    expect(text(fixture.nativeElement)).toContain('Créer un compte élève');
    click(fixture.nativeElement, '#tabEcole');
    await refresh(fixture);
    expect(text(fixture.nativeElement)).toContain('Il n’existe pas d’inscription école');
    expect(text(fixture.nativeElement)).not.toContain('Créer un compte élève');
  });

  it('revient a la page voulue avant la connexion, si elle est sure', async () => {
    const fixture = await setup({ retour: '/ecole/eleves' });
    await submit(fixture, 'ecole@example.com', 'x');
    http.expectOne('/api/auth/login').flush({ success: true, token: 't', user: ECOLE });
    await settle(fixture);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/ecole/eleves');
  });

  it('ignore un retour qui pointe vers un autre site', async () => {
    const fixture = await setup({ retour: 'https://pirate.example' });
    await submit(fixture, 'ecole@example.com', 'x');
    http.expectOne('/api/auth/login').flush({ success: true, token: 't', user: ECOLE });
    await settle(fixture);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/ecole');
  });

  it('le mot de passe peut etre affiche puis masque', async () => {
    const fixture = await setup();
    const field = () => fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    expect(field().type).toBe('password');
    click(fixture.nativeElement, '#btnShow');
    await refresh(fixture);
    expect(field().type).toBe('text');
    click(fixture.nativeElement, '#btnShow');
    await refresh(fixture);
    expect(field().type).toBe('password');
  });
});
