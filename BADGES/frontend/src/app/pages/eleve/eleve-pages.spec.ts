import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/auth.interceptor';
import { ConfigService } from '../../core/config.service';
import { CONFIG, ELEVE, settle, text } from '../../testing';
import { EleveCoursesPage } from './eleve-courses.page';
import { EleveDashboardPage } from './eleve-dashboard.page';

const COURSE_1 = { id: 1, title: 'Introduction à la blockchain', description: 'd', difficulty: 'Beginner' };
const COURSE_2 = { id: 2, title: 'Solidity', description: 'd', difficulty: 'Intermediate' };
const COURSE_3 = { id: 3, title: 'Sécurité', description: 'd', difficulty: 'Advanced' };

const badge = (courseId: number, extra: Record<string, unknown> = {}) => ({
  id: `b${courseId}`, courseId, course: 'x', owner: ELEVE.walletAddress, contractAddress: CONFIG.contractAddress,
  txHash: '0xabc', blockNumber: 7, blockTime: '2026-10-16T19:28:36Z', ...extra,
});

describe('pages de l\'espace eleve', () => {
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

  describe('mon espace', () => {
    it('montre un bloc par cours termine, avec l\'etat de son badge du registre et de son NFT', async () => {
      const fixture = TestBed.createComponent(EleveDashboardPage);
      fixture.detectChanges();
      http.expectOne('/api/me').flush({
        success: true,
        user: { ...ELEVE, completedCourses: [COURSE_1, COURSE_2, COURSE_3] },
        badges: [badge(1), badge(2)],
        nftBadges: [badge(1, { tokenId: 4, contractAddress: CONFIG.nftContractAddress })],
      });
      await settle(fixture);
      const page: HTMLElement = fixture.nativeElement;
      const card = (id: number) => page.querySelector(`[data-course="${id}"]`) as HTMLElement;

      expect(text(page, 'h1')).toBe('Bonjour marwa');
      expect(text(page, '#statCourses')).toBe('3');
      expect(text(page, '#statBadges')).toBe('2');
      expect(text(page, '#statNft')).toBe('1');
      expect(text(page, '#myWallet')).toBe(ELEVE.walletAddress);

      expect(text(card(1))).toContain('Badge du registre ✓');
      expect(text(card(1))).toContain('Badge NFT n° 4 ✓');
      expect(text(card(2))).toContain('Badge du registre ✓');
      expect(text(card(2))).not.toContain('NFT');
      expect(text(card(3))).toContain('n’a pas encore délivré de badge');
    });

    it('chaque preuve renvoie vers la verification PUBLIQUE avec les bons parametres', async () => {
      const fixture = TestBed.createComponent(EleveDashboardPage);
      fixture.detectChanges();
      http.expectOne('/api/me').flush({ success: true, user: { ...ELEVE, completedCourses: [COURSE_1] }, badges: [badge(1)], nftBadges: [] });
      await settle(fixture);
      const link = fixture.nativeElement.querySelector('[data-course="1"] a[href*="verifier"]') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toContain(`type=registre`);
      expect(link.getAttribute('href')).toContain(`adresse=${ELEVE.walletAddress}`);
      expect(link.getAttribute('href')).toContain('cours=1');
    });

    it('sans cours termine : un message qui explique la suite', async () => {
      const fixture = TestBed.createComponent(EleveDashboardPage);
      fixture.detectChanges();
      http.expectOne('/api/me').flush({ success: true, user: { ...ELEVE, completedCourses: [] }, badges: [], nftBadges: [] });
      await settle(fixture);
      expect(text(fixture.nativeElement, '#noBadges')).toContain('pas encore terminé de cours');
    });

    it('une erreur du serveur est affichee, pas une page vide', async () => {
      const fixture = TestBed.createComponent(EleveDashboardPage);
      fixture.detectChanges();
      http.expectOne('/api/me').flush({ success: false, message: 'Utilisateur introuvable' }, { status: 404, statusText: 'Not Found' });
      await settle(fixture);
      expect(text(fixture.nativeElement, '.alert-err')).toContain('Utilisateur introuvable');
    });
  });

  describe('cours', () => {
    it('affiche pour chaque cours : a suivre, termine, ou termine avec badge', async () => {
      const fixture = TestBed.createComponent(EleveCoursesPage);
      fixture.detectChanges();
      http.expectOne('/api/courses').flush({ success: true, courses: [COURSE_1, COURSE_2, COURSE_3] });
      http.expectOne('/api/me').flush({ success: true, user: { ...ELEVE, completedCourses: [COURSE_1, COURSE_2] }, badges: [badge(1)], nftBadges: [] });
      await settle(fixture);
      const card = (id: number) => text(fixture.nativeElement, `[data-course="${id}"]`);
      expect(card(1)).toContain('Terminé, badge délivré ✓');
      expect(card(2)).toContain('Terminé, badge en attente');
      expect(card(3)).toContain('À suivre');
    });

    it('un badge NFT seul suffit pour dire "badge delivre"', async () => {
      const fixture = TestBed.createComponent(EleveCoursesPage);
      fixture.detectChanges();
      http.expectOne('/api/courses').flush({ success: true, courses: [COURSE_1] });
      http.expectOne('/api/me').flush({ success: true, user: { ...ELEVE, completedCourses: [COURSE_1] }, badges: [], nftBadges: [badge(1, { tokenId: 1 })] });
      await settle(fixture);
      expect(text(fixture.nativeElement, '[data-course="1"]')).toContain('Terminé, badge délivré ✓');
    });
  });
});
