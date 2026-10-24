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

/** SHA-256 du texte (encode en UTF-8, comme le fait le serveur), en hexadecimal. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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
