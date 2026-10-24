import { JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { JournalService } from '../core/journal.service';

@Component({
  selector: 'app-journal',
  imports: [JsonPipe],
  template: `
    <div class="journal-head">
      <h2>Journal des échanges</h2>
      <button type="button" class="btn btn-ghost btn-sm" id="btnClear" (click)="journal.clear()">Effacer</button>
    </div>
    <ol id="journal" aria-live="polite">
      @for (e of journal.entries(); track e.id) {
        <li class="entry" [class]="'entry ' + e.kind">
          <div class="entry-top">
            <b>{{ e.title }}</b>
            <span class="time">{{ e.time }}</span>
          </div>
          <span class="chip">
            @if (e.kind === 'pending') { <span class="spin"></span> }
            {{ e.label }}
          </span>
          @if (e.message) { <p class="msg">{{ e.message }}</p> }
          @if (e.facts.length) {
            <dl class="kv">
              @for (f of e.facts; track f.label) {
                <dt>{{ f.label }}</dt>
                <dd>
                  @if (f.href) {
                    <a [href]="f.href" target="_blank" rel="noopener">{{ f.text }} ↗</a>
                  } @else {
                    <span class="mono">{{ f.text }}</span>
                  }
                </dd>
              }
            </dl>
          }
          @if (e.raw) {
            <details>
              <summary>Réponse brute (JSON)</summary>
              <pre>{{ e.raw | json }}</pre>
            </details>
          }
        </li>
      } @empty {
        <li class="empty" id="emptyJournal">Les réponses du serveur apparaîtront ici, avec les liens vers la blockchain.</li>
      }
    </ol>
  `,
})
export class JournalComponent {
  protected readonly journal = inject(JournalService);
}
