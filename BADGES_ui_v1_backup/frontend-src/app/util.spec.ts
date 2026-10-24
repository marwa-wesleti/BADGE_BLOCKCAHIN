import { countDifferences, formatDate, sha256Hex, short } from './util';

describe('util', () => {
  it('raccourcit un long identifiant et laisse intact un court', () => {
    expect(short('0x5fbdb2315678afecb367f032d93f642f64180aa3')).toBe('0x5fbdb2…180aa3');
    expect(short('0x1234')).toBe('0x1234');
    expect(short(null)).toBe('');
  });

  it('formate une date invalide sans planter', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('pas une date')).toBe('pas une date');
  });

  it('compte les caracteres differents entre deux empreintes', () => {
    expect(countDifferences('abcd', 'abcd')).toBe(0);
    expect(countDifferences('abcd', 'abxx')).toBe(2);
  });

  it('calcule le meme SHA-256 que le serveur Java (vecteur de test officiel)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // meme valeur que ProofService.sha256("Contrat v1") cote Java
    expect(await sha256Hex('Contrat v1')).toBe('fb0b068c45e4e615f633dd4d37a975daa6a5bcf7669256c33d2bf8c842a23e43');
  });
});
