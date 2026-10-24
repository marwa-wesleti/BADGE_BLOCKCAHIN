import { Injectable, NgZone, inject, signal } from '@angular/core';

export type ToastKind = 'ok' | 'warn' | 'err' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** Lien facultatif (par exemple la transaction sur Etherscan). */
  href?: string;
  linkLabel?: string;
}

/** Petits messages qui apparaissent un instant : "Badge délivré", "Session expirée"... */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly zone = inject(NgZone);
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  success(text: string, href?: string, linkLabel?: string): void {
    this.push('ok', text, href, linkLabel);
  }

  info(text: string): void {
    this.push('info', text);
  }

  warn(text: string): void {
    this.push('warn', text);
  }

  error(text: string): void {
    this.push('err', text);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: ToastKind, text: string, href?: string, linkLabel?: string): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, text, href, linkLabel }]);
    // Un message avec un lien reste plus longtemps : le temps de cliquer.
    const duration = href ? 12000 : kind === 'err' ? 9000 : 5500;
    // Le minuteur tourne HORS de la zone d'Angular : un simple message qui s'efface tout seul ne doit pas faire croire
    // a l'application qu'elle est encore "occupee" (elle ne serait jamais stable pendant ces secondes).
    this.zone.runOutsideAngular(() => setTimeout(() => this.zone.run(() => this.dismiss(id)), duration));
  }
}
