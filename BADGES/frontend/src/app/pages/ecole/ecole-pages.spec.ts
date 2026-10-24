import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/auth.interceptor';
import { ConfigService } from '../../core/config.service';
import { ToastService } from '../../core/toast.service';
import { CONFIG, click, settle, text, tick, type } from '../../testing';
import { EcoleCoursesPage } from './ecole-courses.page';
import { EcoleDashboardPage } from './ecole-dashboard.page';

const OVERVIEW = { success: true, students: 4, courses: 2, completions: 3, badges: 2, nftBadges: 1, contractAddress: CONFIG.contractAddress, nftContractAddress: CONFIG.nftContractAddress };

describe('pages de l\'espace ecole', () => {
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

  describe('tableau de bord', () => {
    async function open(wallet: { address: string; balanceEth: string } | 'erreur') {
      const fixture = TestBed.createComponent(EcoleDashboardPage);
      fixture.detectChanges();
      http.expectOne('/api/school/overview').flush(OVERVIEW);
      const request = http.expectOne('/api/school/wallet');
      if (wallet === 'erreur') {
        request.flush({ success: false, message: 'Blockchain indisponible : timeout' }, { status: 502, statusText: 'Bad Gateway' });
      } else {
        request.flush({ success: true, ...wallet });
      }
      await settle(fixture);
      return fixture.nativeElement as HTMLElement;
    }

    it('affiche les chiffres et le portefeuille de l\'ecole avec son solde', async () => {
      const page = await open({ address: '0x8101cd9837add3b61f3465e8429e57769ccff52e', balanceEth: '0.392993' });
      expect(text(page, '#statStudents')).toBe('4');
      expect(text(page, '#statCourses')).toBe('2');
      expect(text(page, '#statBadges')).toBe('2');
      expect(text(page, '#statNft')).toBe('1');
      expect(text(page, '#schoolAddress')).toBe('0x8101cd9837add3b61f3465e8429e57769ccff52e');
      expect(text(page, '#schoolBalance')).toContain('0,393 ETH');
      expect(page.querySelector('.alert-warn')).toBeNull();
    });

    it('avertit quand le solde est trop bas pour payer les ecritures', async () => {
      const page = await open({ address: '0x8101', balanceEth: '0.0004' });
      expect(text(page, '.alert-warn')).toContain('Solde bas');
    });

    it('une panne du reseau ne casse pas le tableau de bord', async () => {
      const page = await open('erreur');
      expect(text(page, '#statStudents')).toBe('4');
      expect(text(page, '.alert-warn')).toContain('Blockchain indisponible');
    });

    it('la liste de demarrage suit l\'avancement reel', async () => {
      const page = await open({ address: '0x8101', balanceEth: '1' });
      const done = Array.from(page.querySelectorAll('.checklist li')).map((li) => li.classList.contains('done'));
      expect(done).toEqual([true, true, true, true]); // cours, eleve, cours valide, badge delivre
    });
  });

  describe('cours', () => {
    it('liste le catalogue et cree un cours', async () => {
      const fixture = TestBed.createComponent(EcoleCoursesPage);
      fixture.detectChanges();
      http.expectOne('/api/courses').flush({ success: true, courses: [{ id: 1, title: 'Intro', description: 'd', difficulty: 'Beginner' }] });
      await settle(fixture);
      const page: HTMLElement = fixture.nativeElement;
      expect(text(page, '#coursesTable')).toContain('Intro');

      type(page.querySelector('#title'), 'Solidity');
      type(page.querySelector('#description'), 'Écrire un contrat');
      fixture.detectChanges(); // dans un vrai navigateur, la page se redessine apres chaque frappe
      click(page, '#btnCreateCourse');
      const request = http.expectOne('/api/courses');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ title: 'Solidity', description: 'Écrire un contrat', difficulty: 'Beginner' });
      request.flush({ success: true, course: { id: 2, title: 'Solidity', description: 'Écrire un contrat', difficulty: 'Beginner' } }, { status: 201, statusText: 'Created' });
      await tick(); // la page recharge alors le catalogue
      http.expectOne('/api/courses').flush({ success: true, courses: [
        { id: 1, title: 'Intro', description: 'd', difficulty: 'Beginner' },
        { id: 2, title: 'Solidity', description: 'Écrire un contrat', difficulty: 'Beginner' }] });
      await settle(fixture);

      expect(text(page, '#coursesTable')).toContain('Solidity');
      expect(TestBed.inject(ToastService).toasts()[0].text).toContain('n° 2');
      expect((page.querySelector('#title') as HTMLInputElement).value).toBe(''); // le formulaire est vide pour le suivant
    });

    it('un titre ou une description vide est refuse sans appeler le serveur', async () => {
      const fixture = TestBed.createComponent(EcoleCoursesPage);
      fixture.detectChanges();
      http.expectOne('/api/courses').flush({ success: true, courses: [] });
      await settle(fixture);
      expect(text(fixture.nativeElement)).toContain('Aucun cours pour l’instant');
      click(fixture.nativeElement, '#btnCreateCourse');
      await settle(fixture);
      expect(text(fixture.nativeElement, '.alert-err')).toContain('obligatoires');
      http.expectNone((r) => r.method === 'POST');
    });
  });
});
