import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/auth.interceptor';
import { ConfigService } from '../../core/config.service';
import { JournalService } from '../../core/journal.service';
import { ToastService } from '../../core/toast.service';
import { CONFIG, choose, click, refresh, settle, text, tick, type } from '../../testing';
import { EcoleStudentsPage } from './ecole-students.page';

const COURSES = { success: true, courses: [
  { id: 1, title: 'Introduction à la blockchain', description: 'd', difficulty: 'Beginner' },
  { id: 2, title: 'Solidity', description: 'd', difficulty: 'Intermediate' },
] };

const student = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, username: name, email: `${name}@example.com`, walletAddress: `0x${String(id).padStart(40, '0')}`, role: 'ELEVE',
  hasPassword: true, completedCourseIds: [], badgeCourseIds: [], nftCourseIds: [], ...extra,
});

const STUDENTS = { success: true, students: [
  student(10, 'alice'),                                                                                   // cours 1 non termine
  student(11, 'bob', { completedCourseIds: [1] }),                                                        // termine, rien delivre
  student(12, 'carla', { completedCourseIds: [1], badgeCourseIds: [1] }),                                 // badge deja delivre
  student(13, 'dina', { completedCourseIds: [1], badgeCourseIds: [1], nftCourseIds: [1] }),               // tout delivre
  student(14, 'eric', { hasPassword: false }),
] };

// deux fenetres modales dans la page : on designe chacune par son nom
const RESET_DIALOG = 'dialog[aria-label="Réinitialiser un mot de passe"]';
const CREATE_DIALOG = 'dialog[aria-label="Nouvel élève"]';

describe('EcoleStudentsPage', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<EcoleStudentsPage>;
  const page = () => fixture.nativeElement as HTMLElement;
  const rowOf = (name: string) => page().querySelector(`tr[data-student="${name}@example.com"]`) as HTMLElement;
  const actions = (name: string) => Array.from(rowOf(name).querySelectorAll<HTMLButtonElement>('[data-action]')).map((b) => b.dataset['action']);

  async function setup(nftContract: string | null = CONFIG.nftContractAddress) {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(ConfigService).config.set({ ...CONFIG, nftContractAddress: nftContract });
    fixture = TestBed.createComponent(EcoleStudentsPage);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush(COURSES);
    http.expectOne('/api/school/students').flush(STUDENTS);
    await settle(fixture);
  }

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('propose le bon geste selon l\'etat de chaque eleve pour le cours choisi', async () => {
    await setup();
    expect(actions('alice')).toEqual(['complete', 'reset']);
    expect(actions('bob')).toEqual(['badge', 'nft', 'reset']);
    expect(actions('carla')).toEqual(['nft', 'reset']);   // le badge du registre est deja la
    expect(actions('dina')).toEqual(['reset']);           // tout est delivre
    expect(text(rowOf('dina'))).toContain('Badge ✓');
    expect(text(rowOf('dina'))).toContain('NFT ✓');
    expect(text(rowOf('eric'))).toContain('sans mot de passe');
  });

  it('sans contrat NFT deploye, aucun bouton NFT n\'est propose', async () => {
    await setup(null);
    expect(actions('bob')).toEqual(['badge', 'reset']);
  });

  it('changer de cours change l\'etat affiche (cours 2 : personne n\'a rien)', async () => {
    await setup();
    choose(page().querySelector('#courseSelect'), 1);
    await refresh(fixture);
    expect(actions('bob')).toEqual(['complete', 'reset']);
    expect(text(rowOf('bob'))).toContain('Non terminé');
  });

  it('la recherche filtre par pseudo, e-mail ou adresse', async () => {
    await setup();
    type(page().querySelector('#search'), 'CARLA');
    await refresh(fixture);
    expect(page().querySelectorAll('tr[data-student]').length).toBe(1);
    type(page().querySelector('#search'), 'personne');
    await refresh(fixture);
    expect(text(page(), '#studentsTable tbody')).toContain('Aucun élève ne correspond');
  });

  it('valider un cours envoie le bon e-mail et le bon cours, puis recharge la liste', async () => {
    await setup();
    const toasts = TestBed.inject(ToastService);
    click(rowOf('alice'), '[data-action="complete"]');
    const request = http.expectOne('/api/courses/1/complete');
    expect(request.request.body).toEqual({ email: 'alice@example.com' });
    request.flush({ success: true, message: 'Cours marque comme termine' });
    await tick(); // la page recharge alors la liste des eleves
    http.expectOne('/api/school/students').flush({ success: true, students: [student(10, 'alice', { completedCourseIds: [1] }), ...STUDENTS.students.slice(1)] });
    await settle(fixture);

    expect(actions('alice')).toEqual(['badge', 'nft', 'reset']); // il peut maintenant recevoir un badge
    expect(toasts.toasts()[0].text).toContain('Cours validé pour alice');
    expect(TestBed.inject(JournalService).entries()[0].title).toBe('Cours validé pour un élève');
  });

  it('delivrer un badge : une ecriture, un message avec le lien de la transaction, et la liste mise a jour', async () => {
    await setup();
    const toasts = TestBed.inject(ToastService);
    click(rowOf('bob'), '[data-action="badge"]');
    await refresh(fixture);
    // pendant l'ecriture : tous les boutons attendent, et on explique pourquoi
    expect(page().querySelector('#busyNotice')).not.toBeNull();
    expect(Array.from(page().querySelectorAll<HTMLButtonElement>('[data-action]')).every((b) => b.disabled)).toBeTrue();

    const request = http.expectOne('/api/badges/issue');
    expect(request.request.body).toEqual({ email: 'bob@example.com', courseId: 1 });
    request.flush({
      success: true,
      badge: { courseId: 1, course: 'Introduction à la blockchain', txHash: '0xabc', blockNumber: 5, blockTime: '2026-10-16T19:28:36Z', contractAddress: CONFIG.contractAddress },
      links: { transaction: 'https://sepolia.etherscan.io/tx/0xabc', contract: 'x' },
    }, { status: 201, statusText: 'Created' });
    await tick();
    http.expectOne('/api/school/students').flush({ success: true, students: [student(11, 'bob', { completedCourseIds: [1], badgeCourseIds: [1] }), ...STUDENTS.students.filter((s) => s.id !== 11)] });
    await settle(fixture);

    expect(page().querySelector('#busyNotice')).toBeNull();
    expect(actions('bob')).toEqual(['nft', 'reset']);
    expect(toasts.toasts()[0].href).toBe('https://sepolia.etherscan.io/tx/0xabc');
  });

  it('creer un NFT appelle la route NFT', async () => {
    await setup();
    click(rowOf('bob'), '[data-action="nft"]');
    const request = http.expectOne('/api/nft-badges/issue');
    expect(request.request.body).toEqual({ email: 'bob@example.com', courseId: 1 });
    request.flush({ success: false, message: 'Badge NFT deja delivre pour ce cours' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    const toasts = TestBed.inject(ToastService);
    expect(toasts.toasts()[0].kind).toBe('err');
    expect(toasts.toasts()[0].text).toContain('rien n’a été envoyé sur la blockchain');
  });

  it('un refus du contrat (422) est presente comme tel', async () => {
    await setup();
    click(rowOf('bob'), '[data-action="badge"]');
    http.expectOne('/api/badges/issue').flush({ success: false, message: 'Le contrat a refuse l\'operation : Seule l\'ecole peut effectuer cette action' }, { status: 422, statusText: 'Unprocessable Entity' });
    await settle(fixture);
    expect(TestBed.inject(ToastService).toasts()[0].text).toContain('Refusé par le smart contract');
    expect(page().querySelector('#busyNotice')).toBeNull(); // l'ecriture est terminee, les boutons reviennent
  });

  it('reinitialiser un mot de passe : confirmation, mot de passe temporaire affiche une fois, efface a la fermeture', async () => {
    await setup();
    click(rowOf('eric'), '[data-action="reset"]');
    await refresh(fixture);
    expect((page().querySelector(RESET_DIALOG) as HTMLDialogElement).open).toBeTrue();
    expect(text(page(), RESET_DIALOG)).toContain('Mot de passe de eric');
    expect(text(page(), RESET_DIALOG)).toContain('L’ancien ne fonctionnera plus');
    expect(text(page(), RESET_DIALOG)).toContain('choisir son propre mot de passe'); // l'eleve devra le remplacer a sa premiere connexion
    expect(rowOf('eric').querySelector('[data-flag="temporary"]')).toBeNull();

    click(page(), '#btnConfirmReset');
    http.expectOne('/api/school/students/14/reset-password').flush({ success: true, temporaryPassword: 'Abcdefgh2345', warning: 'w' });
    await tick();
    // la liste rechargee montre que le mot de passe de eric est desormais temporaire
    http.expectOne('/api/school/students').flush({ success: true, students: STUDENTS.students.map((s) => (s.id === 14 ? { ...s, hasPassword: true, mustChangePassword: true } : s)) });
    await settle(fixture);
    expect(text(page(), '#tempPassword')).toBe('Abcdefgh2345');
    expect(text(rowOf('eric').querySelector('[data-flag="temporary"]') as HTMLElement)).toBe('mot de passe temporaire');

    // le mot de passe temporaire n'a pas ete mis dans le journal des echanges
    expect(JSON.stringify(TestBed.inject(JournalService).entries())).not.toContain('Abcdefgh2345');

    click(page(), '#btnCloseReset');
    await refresh(fixture);
    expect((page().querySelector(RESET_DIALOG) as HTMLDialogElement).open).toBeFalse();
    expect(page().querySelector('#tempPassword')).toBeNull();
  });

  describe('creer le compte d\'un eleve', () => {
    const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const CREATED = {
      success: true,
      user: student(20, 'nadia', { mustChangePassword: true }),
      temporaryPassword: 'Tmp12345abcd',
      privateKey: KEY,
      warning: 'w',
    };

    async function open() {
      await setup();
      click(page(), '#btnNewStudent');
      await refresh(fixture);
    }

    async function fillForm(username: string, email: string) {
      type(page().querySelector('#newUsername'), username);
      type(page().querySelector('#newEmail'), email);
      click(page(), '#btnCreateStudent');
      await refresh(fixture);
    }

    it('le bouton « Nouvel élève » ouvre un formulaire pseudo + e-mail et explique ce qui sera genere', async () => {
      await open();
      expect((page().querySelector(CREATE_DIALOG) as HTMLDialogElement).open).toBeTrue();
      expect(text(page(), CREATE_DIALOG)).toContain('portefeuille Ethereum');
      expect(text(page(), CREATE_DIALOG)).toContain('mot de passe temporaire');
      expect(text(page(), CREATE_DIALOG)).toContain('Aucun e-mail n’est envoyé');
      expect(page().querySelector('#newUsername')).not.toBeNull();
      expect(page().querySelector('#newEmail')).not.toBeNull();
    });

    it('le bouton est la meme quand il n\'y a encore ni cours ni eleve', async () => {
      sessionStorage.clear();
      TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
      http = TestBed.inject(HttpTestingController);
      TestBed.inject(ConfigService).config.set(CONFIG);
      fixture = TestBed.createComponent(EcoleStudentsPage);
      fixture.detectChanges();
      http.expectOne('/api/courses').flush({ success: true, courses: [] });
      http.expectOne('/api/school/students').flush({ success: true, students: [] });
      await settle(fixture);
      expect(page().querySelector('#btnNewStudent')).not.toBeNull();
    });

    it('des saisies invalides sont refusees sans appeler le serveur', async () => {
      await open();
      await fillForm('ab', 'nadia@example.com');
      expect(text(page(), '#createError')).toContain('entre 3 et 40');
      await fillForm('nadia', 'pas-un-email');
      expect(text(page(), '#createError')).toContain('e-mail valide');
      http.expectNone('/api/school/students');
    });

    it('creation : seul le pseudo et l\'e-mail partent ; le temporaire et la cle ne s\'affichent qu\'une fois, la cle masquee par defaut', async () => {
      await open();
      await fillForm('  nadia  ', ' nadia@example.com ');
      const request = http.expectOne((r) => r.method === 'POST' && r.url === '/api/school/students');
      expect(request.request.body).toEqual({ username: 'nadia', email: 'nadia@example.com' }); // pas de mot de passe choisi par l'ecole
      request.flush(CREATED, { status: 201, statusText: 'Created' });
      await tick();
      http.expectOne((r) => r.method === 'GET' && r.url === '/api/school/students').flush({ success: true, students: [...STUDENTS.students, CREATED.user] });
      await settle(fixture);

      expect(text(page(), CREATE_DIALOG)).toContain('Compte créé pour nadia');
      expect(text(page(), '#createdEmail')).toBe('nadia@example.com');
      expect(text(page(), '#createdPassword')).toBe('Tmp12345abcd');
      expect(text(page(), '#createdKey')).not.toContain('0x59c6'); // masquee tant qu'on ne clique pas sur Afficher
      click(page(), '#btnShowKey');
      await refresh(fixture);
      expect(text(page(), '#createdKey')).toBe(KEY);
      expect(TestBed.inject(ToastService).toasts()[0].text).toContain('Compte créé pour nadia');

      // le nouvel eleve est deja dans la liste, signale "mot de passe temporaire"
      expect(text(rowOf('nadia').querySelector('[data-flag="temporary"]') as HTMLElement)).toBe('mot de passe temporaire');
      // ni le temporaire ni la cle ne sont dans le journal des echanges
      const journal = JSON.stringify(TestBed.inject(JournalService).entries());
      expect(journal).not.toContain('Tmp12345abcd');
      expect(journal).not.toContain('0x59c6');
    });

    it('fermer la fenetre efface le temporaire et la cle de la page', async () => {
      await open();
      await fillForm('nadia', 'nadia@example.com');
      http.expectOne((r) => r.method === 'POST' && r.url === '/api/school/students').flush(CREATED, { status: 201, statusText: 'Created' });
      await tick();
      http.expectOne((r) => r.method === 'GET' && r.url === '/api/school/students').flush(STUDENTS);
      await settle(fixture);
      click(page(), '#btnShowKey');
      await refresh(fixture);

      click(page(), '#btnCloseCreated');
      await refresh(fixture);
      expect((page().querySelector(CREATE_DIALOG) as HTMLDialogElement).open).toBeFalse();
      expect(page().textContent).not.toContain('Tmp12345abcd');
      expect(page().textContent).not.toContain('0x59c6995e');

      // une nouvelle ouverture repart d'un formulaire vide, jamais du compte precedent
      click(page(), '#btnNewStudent');
      await refresh(fixture);
      expect((page().querySelector('#newUsername') as HTMLInputElement).value).toBe('');
      expect(page().querySelector('#createdPassword')).toBeNull();
    });

    it('un pseudo ou un e-mail deja utilise (409) est explique dans la fenetre, sans rien afficher d\'autre', async () => {
      await open();
      await fillForm('alice', 'alice@example.com');
      http.expectOne((r) => r.method === 'POST' && r.url === '/api/school/students')
        .flush({ success: false, message: 'Ce pseudo ou cet e-mail est deja utilise' }, { status: 409, statusText: 'Conflict' });
      await settle(fixture);
      expect(text(page(), '#createError')).toBe('Ce pseudo ou cet e-mail est déjà utilisé.');
      expect(page().querySelector('#createdPassword')).toBeNull();
      expect((page().querySelector(CREATE_DIALOG) as HTMLDialogElement).open).toBeTrue(); // on peut corriger et recommencer
    });
  });

  it('sans cours, on explique quoi faire', async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(ConfigService).config.set(CONFIG);
    fixture = TestBed.createComponent(EcoleStudentsPage);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush({ success: true, courses: [] });
    http.expectOne('/api/school/students').flush({ success: true, students: [] });
    await settle(fixture);
    expect(text(page())).toContain('Créez d’abord un cours');
  });
});
