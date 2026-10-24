import { Injectable, signal } from '@angular/core';
import { ApiResult, EntryKind, Fact, JournalEntry } from './models';
import { formatTime } from './util';

const REFUSALS: Record<number, [EntryKind, string]> = {
  400: ['warn', 'Requête refusée'],
  404: ['warn', 'Introuvable'],
  409: ['warn', 'Refusé : doublon'],
  422: ['warn', 'Refusé par le smart contract'],
  502: ['err', 'Blockchain indisponible'],
};

/** Transforme une reponse de l'API en pastille du journal (couleur + texte). */
export function classify(result: ApiResult): { kind: EntryKind; label: string } {
  let kind: EntryKind = 'ok';
  let label = 'Réussi';
  if (result.status === 0) {
    kind = 'err';
    label = 'Serveur injoignable';
  } else if (!result.ok) {
    [kind, label] = REFUSALS[result.status] ?? ['err', `Erreur ${result.status}`];
  } else if (typeof result.data?.['valid'] === 'boolean') {
    kind = result.data['valid'] ? 'ok' : 'warn';
    label = result.data['valid'] ? 'Valide ✓' : 'Non valide ✗';
  }
  return { kind, label: result.status ? `${label} (HTTP ${result.status})` : label };
}

/** Journal des echanges avec le serveur : le plus recent en premier. */
@Injectable({ providedIn: 'root' })
export class JournalService {
  private nextId = 1;
  readonly entries = signal<JournalEntry[]>([]);

  start(title: string): number {
    const id = this.nextId++;
    const entry: JournalEntry = { id, title, time: formatTime(), kind: 'pending', label: 'En cours…', facts: [] };
    this.entries.update((list) => [entry, ...list]);
    return id;
  }

  finish(id: number, result: ApiResult, facts: Fact[] = []): void {
    const { kind, label } = classify(result);
    const message = result.data?.['message'] ?? result.data?.['error'];
    this.entries.update((list) =>
      list.map((e) => (e.id === id ? { ...e, kind, label, facts, message, raw: result.data } : e)),
    );
  }

  clear(): void {
    this.entries.set([]);
  }
}
