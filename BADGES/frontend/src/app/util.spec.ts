import { countDifferences, formatDate, formatEth, isEthAddress, isSha256, sha256File, sha256Hex, short, verificationLink } from './util';

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

  it('reconnait une adresse Ethereum et une empreinte SHA-256', () => {
    expect(isEthAddress('0x61aa685ca727156af0d49029a49a28e8eac87f80')).toBeTrue();
    expect(isEthAddress(' 0x61AA685CA727156AF0D49029A49A28E8EAC87F80 ')).toBeTrue(); // majuscules et espaces tolerés
    expect(isEthAddress('0x61aa')).toBeFalse();
    expect(isEthAddress('61aa685ca727156af0d49029a49a28e8eac87f80')).toBeFalse();
    expect(isEthAddress(null)).toBeFalse();
    expect(isSha256('a'.repeat(64))).toBeTrue();
    expect(isSha256('a'.repeat(63))).toBeFalse();
    expect(isSha256('g'.repeat(64))).toBeFalse();
  });

  it('formate un solde sans afficher 0 quand il reste un peu', () => {
    expect(formatEth('0.392993011')).toBe('0,393 ETH');
    expect(formatEth(0.0004)).toBe('0,0004 ETH');
    expect(formatEth(null)).toBe('—');
    expect(formatEth('pas un nombre')).toBe('—');
  });

  it('construit un lien de verification public', () => {
    const link = verificationLink('nft', '0x61aa', 3);
    expect(link).toContain('#/verifier?');
    expect(link).toContain('type=nft');
    expect(link).toContain('adresse=0x61aa');
    expect(link).toContain('cours=3');
  });

  it('calcule le SHA-256 d\'un fichier comme celui d\'un texte', async () => {
    expect(await sha256File(new Blob(['abc']))).toBe(await sha256Hex('abc'));
  });

  it('calcule le meme SHA-256 que le serveur Java (vecteur de test officiel)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // meme valeur que ProofService.sha256("Contrat v1") cote Java
    expect(await sha256Hex('Contrat v1')).toBe('fb0b068c45e4e615f633dd4d37a975daa6a5bcf7669256c33d2bf8c842a23e43');
  });
});
