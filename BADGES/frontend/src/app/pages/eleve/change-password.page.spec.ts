import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { authInterceptor } from '../../core/auth.interceptor';
import { ToastService } from '../../core/toast.service';
import { ELEVE, click, refresh, settle, text, type } from '../../testing';
import { ChangePasswordPage } from './change-password.page';

describe('ChangePasswordPage', () => {
  let http: HttpTestingController;
  let router: Router;
  let auth: AuthService;

  async function setup(mustChangePassword: boolean) {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    auth = TestBed.inject(AuthService);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    auth.user.set({ ...ELEVE, mustChangePassword });
    const fixture = TestBed.createComponent(ChangePasswordPage);
    fixture.detectChanges();
    await refresh(fixture); // laisse ngModel s'initialiser avant qu'on tape
    return fixture;
  }

  async function submit(fixture: Awaited<ReturnType<typeof setup>>, current: string, next: string, confirm = next) {
    const page: HTMLElement = fixture.nativeElement;
    type(page.querySelector('#current'), current);
    type(page.querySelector('#next'), next);
    type(page.querySelector('#confirm'), confirm);
    click(page, '#btnChange');
    await refresh(fixture);
  }

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  describe('apres une reinitialisation par l\'ecole (obligatoire)', () => {
    it('explique que le mot de passe est temporaire et ne propose pas d\'annuler', async () => {
      const fixture = await setup(true);
      const page: HTMLElement = fixture.nativeElement;
      expect(text(page, 'h1')).toBe('Choisissez votre mot de passe');
      expect(text(page, '#forcedNotice')).toContain('temporaire');
      expect(text(page, 'label[for="current"]')).toContain('temporaire');
      expect(page.querySelector('#btnCancel')).toBeNull();
    });

    it('un changement reussi met a jour le profil et envoie vers l\'espace eleve', async () => {
      const fixture = await setup(true);
      await submit(fixture, 'Tmp12345abcd', 'MonNouveauMdp9');
      const request = http.expectOne('/api/auth/change-password');
      expect(request.request.body).toEqual({ currentPassword: 'Tmp12345abcd', newPassword: 'MonNouveauMdp9' });
      request.flush({ success: true, user: { ...ELEVE, mustChangePassword: false } });
      await settle(fixture);

      expect(auth.user()?.mustChangePassword).toBeFalse();
      expect(auth.mustChangePassword()).toBeFalse();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/eleve');
      expect(TestBed.inject(ToastService).toasts()[0].text).toContain('changé');
    });

    it('un mauvais mot de passe temporaire est signale et son champ est vide', async () => {
      const fixture = await setup(true);
      await submit(fixture, 'faux', 'MonNouveauMdp9');
      http.expectOne('/api/auth/change-password').flush({ success: false, message: 'Mot de passe actuel incorrect' }, { status: 401, statusText: 'Unauthorized' });
      await settle(fixture);
      expect(text(fixture.nativeElement, '#changeError')).toBe('Le mot de passe temporaire est incorrect.');
      expect((fixture.nativeElement.querySelector('#current') as HTMLInputElement).value).toBe('');
      expect(auth.mustChangePassword()).toBeTrue(); // toujours bloque
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('changement volontaire', () => {
    it('propose d\'annuler et redemande l\'ancien mot de passe', async () => {
      const fixture = await setup(false);
      const page: HTMLElement = fixture.nativeElement;
      expect(text(page, 'h1')).toBe('Changer mon mot de passe');
      expect(page.querySelector('#forcedNotice')).toBeNull();
      expect(text(page, 'label[for="current"]')).toBe('Mot de passe actuel');
      expect(page.querySelector('#btnCancel')).not.toBeNull();
    });
  });

  describe('saisies refusees sans appeler le serveur', () => {
    const cases: [string, string, string, string, string][] = [
      ['ancien mot de passe manquant', '', 'MonNouveauMdp9', 'MonNouveauMdp9', 'Saisissez'],
      ['nouveau trop court', 'ancien-mdp-1', 'court', 'court', '8 caractères'],
      ['nouveau identique a l\'ancien', 'meme-mdp-123', 'meme-mdp-123', 'meme-mdp-123', 'différent'],
      ['confirmation differente', 'ancien-mdp-1', 'MonNouveauMdp9', 'MonNouveauMdp8', 'ne correspondent pas'],
      ['nouveau trop long (72 octets max)', 'ancien-mdp-1', 'é'.repeat(40), 'é'.repeat(40), 'trop long'],
    ];
    for (const [name, current, next, confirm, message] of cases) {
      it(name, async () => {
        const fixture = await setup(true);
        await submit(fixture, current, next, confirm);
        expect(text(fixture.nativeElement, '#changeError')).toContain(message);
        http.expectNone('/api/auth/change-password');
      });
    }
  });

  it('trop de tentatives (429) est explique', async () => {
    const fixture = await setup(false);
    await submit(fixture, 'ancien-mdp-1', 'MonNouveauMdp9');
    http.expectOne('/api/auth/change-password').flush({ success: false, message: 'Trop de tentatives' }, { status: 429, statusText: 'Too Many Requests' });
    await settle(fixture);
    expect(text(fixture.nativeElement, '#changeError')).toContain('Trop de tentatives');
  });

  it('le serveur arrete : message clair', async () => {
    const fixture = await setup(false);
    await submit(fixture, 'ancien-mdp-1', 'MonNouveauMdp9');
    http.expectOne('/api/auth/change-password').error(new ProgressEvent('error'));
    await settle(fixture);
    expect(text(fixture.nativeElement, '#changeError')).toContain('ne répond pas');
  });

  it('Afficher / Masquer change le type des trois champs', async () => {
    const fixture = await setup(false);
    const page: HTMLElement = fixture.nativeElement;
    const types = () => ['#current', '#next', '#confirm'].map((id) => (page.querySelector(id) as HTMLInputElement).type);
    expect(types()).toEqual(['password', 'password', 'password']);
    click(page, '#btnShow');
    await refresh(fixture);
    expect(types()).toEqual(['text', 'text', 'text']);
  });
});
