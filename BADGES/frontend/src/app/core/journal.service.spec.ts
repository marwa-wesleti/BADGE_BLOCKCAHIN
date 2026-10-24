import { TestBed } from '@angular/core/testing';
import { JournalService, classify } from './journal.service';

describe('classify', () => {
  it('reussite', () => {
    expect(classify({ status: 201, ok: true, data: {} })).toEqual({ kind: 'ok', label: 'Réussi (HTTP 201)' });
  });

  it('distingue un refus metier d\'une panne', () => {
    expect(classify({ status: 409, ok: false, data: {} }).kind).toBe('warn');
    expect(classify({ status: 422, ok: false, data: {} }).label).toContain('smart contract');
    expect(classify({ status: 502, ok: false, data: {} }).kind).toBe('err');
    expect(classify({ status: 500, ok: false, data: {} }).kind).toBe('err');
  });

  it('serveur injoignable (status 0)', () => {
    expect(classify({ status: 0, ok: false, data: {} })).toEqual({ kind: 'err', label: 'Serveur injoignable' });
  });

  it('une verification repond 200 mais valid=false reste un avertissement', () => {
    expect(classify({ status: 200, ok: true, data: { valid: true } }).kind).toBe('ok');
    expect(classify({ status: 200, ok: true, data: { valid: false } }).kind).toBe('warn');
  });
});

describe('JournalService', () => {
  let journal: JournalService;

  beforeEach(() => {
    journal = TestBed.inject(JournalService);
  });

  it('met le plus recent en premier et passe de "en cours" au resultat', () => {
    const first = journal.start('Premier');
    journal.start('Second');
    expect(journal.entries().map((e) => e.title)).toEqual(['Second', 'Premier']);
    expect(journal.entries()[1].kind).toBe('pending');

    journal.finish(first, { status: 201, ok: true, data: { message: 'ok' } }, [{ label: 'Bloc', text: '3' }]);
    const finished = journal.entries().find((e) => e.id === first)!;
    expect(finished.kind).toBe('ok');
    expect(finished.message).toBe('ok');
    expect(finished.facts.length).toBe(1);
  });

  it('efface le journal', () => {
    journal.start('x');
    journal.clear();
    expect(journal.entries()).toEqual([]);
  });
});
