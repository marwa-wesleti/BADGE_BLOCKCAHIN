import { DocumentType } from './models';

/** Raccourcit un long identifiant : 0x5fbdb231…180aa3 */
export function short(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  return isNaN(date.getTime()) ? String(iso) : date.toLocaleString('fr-FR');
}

export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('fr-FR');
}

/** Le navigateur sait-il calculer un SHA-256 ? (seulement en contexte securise : https ou localhost) */
export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

function toHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 du texte (encode en UTF-8, comme le fait le serveur), en hexadecimal. */
export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** SHA-256 d'un fichier, calcule ICI dans le navigateur : le fichier n'est jamais envoye nulle part. */
export async function sha256File(file: Blob): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
}

/** Une adresse Ethereum : 0x suivi de 40 caracteres hexadecimaux. */
export function isEthAddress(value: string | null | undefined): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test((value ?? '').trim());
}

/** Une empreinte SHA-256 : 64 caracteres hexadecimaux. */
export function isSha256(value: string | null | undefined): boolean {
  return /^[0-9a-fA-F]{64}$/.test((value ?? '').trim());
}

/** Le lien public qui refait une verification de badge : n'importe qui l'ouvre, sans compte. */
export function verificationLink(type: 'registre' | 'nft', wallet: string, courseId: number | string): string {
  const query = new URLSearchParams({ type, adresse: wallet, cours: String(courseId) });
  return `${window.location.origin}${window.location.pathname}#/verifier?${query.toString()}`;
}

/** Le lien public qui verifie une empreinte de document (celui du QR code du certificat). */
export function documentVerificationLink(hash: string): string {
  const query = new URLSearchParams({ type: 'document', hash });
  return `${window.location.origin}${window.location.pathname}#/verifier?${query.toString()}`;
}

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'DIPLOME', label: 'Diplôme' },
  { value: 'RELEVE', label: 'Relevé de notes' },
  { value: 'ATTESTATION', label: 'Attestation' },
  { value: 'AUTRE', label: 'Autre document' },
];

export function documentTypeLabel(type: DocumentType): string {
  return DOCUMENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** Enregistre un fichier recu de l'API (un PDF par exemple) comme le ferait un lien de telechargement. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Un solde en ETH, avec assez de decimales pour ne pas afficher 0 quand il reste un peu. */
export function formatEth(value: string | number | null | undefined): string {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) {
    return '—';
  }
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 4 }) + ' ETH';
}

/** Nombre de caracteres differents entre deux empreintes de meme longueur. */
export function countDifferences(a: string, b: string): number {
  let differences = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      differences++;
    }
  }
  return differences;
}
