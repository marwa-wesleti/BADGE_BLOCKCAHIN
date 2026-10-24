import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/auth.interceptor';
import { ConfigService } from '../../core/config.service';
import { CONFIG, ELEVE, click, refresh, settle, text, type } from '../../testing';
import { RegisterPage } from './register.page';

type Values = { username?: string; email?: string; password?: string; confirm?: string };

describe('RegisterPage', () => {
  let http: HttpTestingController;
  let router: Router;

  async function setup() {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    TestBed.inject(ConfigService).config.set(CONFIG);
    const fixture = TestBed.createComponent(RegisterPage);
    fixture.detectChanges();
    await refresh(fixture); // laisse ngModel s'initialiser avant qu'on tape
    return fixture;
  }

  /** Remplit le formulaire et l'envoie (avec des valeurs valides par defaut). */
  async function fill(fixture: Awaited<ReturnType<typeof setup>>, values: Values) {
    const page: HTMLElement = fixture.nativeElement;
    type(page.querySelector('#username'), values.username ?? 'marwa');
    type(page.querySelector('#email'), values.email ?? 'marwa@example.com');
    type(page.querySelector('#password'), values.password ?? 'motdepasse1');
    type(page.querySelector('#confirm'), values.confirm ?? values.password ?? 'motdepasse1');
    click(page, '#btnRegister');
    await refresh(fixture);
  }

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  const invalid: [string, Values, string][] = [
    ['un pseudo trop court', { username: 'ab' }, 'pseudo'],
    ['un e-mail invalide', { email: 'pas-un-email' }, 'e-mail'],
    ['un mot de passe trop court', { password: 'court' }, '8 caractères'],
    ['deux mots de passe differents', { password: 'motdepasse1', confirm: 'motdepasse2' }, 'pas identiques'],
  ];
  for (const [label, values, expected] of invalid) {
    it(`refuse ${label} sans appeler le serveur`, async () => {
      const fixture = await setup();
      await fill(fixture, values);
      expect(text(fixture.nativeElement, '#registerError')).toContain(expected);
      http.expectNone('/api/auth/register');
    });
  }

  it('pseudo ou e-mail deja pris (409) : message clair', async () => {
    const fixture = await setup();
    await fill(fixture, {});
    http.expectOne('/api/auth/register').flush({ success: false, message: 'deja' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(text(fixture.nativeElement, '#registerError')).toContain('déjà utilisé');
  });

  it('envoie les bonnes donnees, puis montre le portefeuille avec la cle masquee', async () => {
    const fixture = await setup();
    await fill(fixture, {});
    const request = http.expectOne('/api/auth/register');
    expect(request.request.body).toEqual({ username: 'marwa', email: 'marwa@example.com', password: 'motdepasse1' });
    request.flush({ success: true, token: 't', user: ELEVE, privateKey: 'cle-tres-secrete' }, { status: 201, statusText: 'Created' });
    await settle(fixture);

    const page: HTMLElement = fixture.nativeElement;
    expect(text(page, '#walletView')).toBe(ELEVE.walletAddress);
    expect(text(page, '#keyView')).not.toContain('cle-tres-secrete'); // masquee par defaut
    click(page, '#toggleKey');
    await refresh(fixture);
    expect(text(page, '#keyView')).toBe('cle-tres-secrete');
    click(page, '#toggleKey');
    await refresh(fixture);
    expect(text(page, '#keyView')).not.toContain('cle-tres-secrete');
  });

  it('le bouton "Acceder a mon espace" attend la confirmation, puis efface la cle', async () => {
    const fixture = await setup();
    await fill(fixture, {});
    http.expectOne('/api/auth/register').flush({ success: true, token: 't', user: ELEVE, privateKey: 'cle-tres-secrete' }, { status: 201, statusText: 'Created' });
    await settle(fixture);

    const page: HTMLElement = fixture.nativeElement;
    const button = () => page.querySelector('#btnContinue') as HTMLButtonElement;
    expect(button().disabled).toBeTrue();
    (page.querySelector('#savedKey') as HTMLInputElement).click();
    await refresh(fixture);
    expect(button().disabled).toBeFalse();

    click(page, '#toggleKey');
    await refresh(fixture);
    expect(text(page, '#keyView')).toBe('cle-tres-secrete');
    click(page, '#btnContinue');
    await refresh(fixture);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/eleve');
    expect(text(page, '#keyView')).not.toContain('cle-tres-secrete');
  });
});
