import { Component, input } from '@angular/core';
import { Verdict } from '../models';
import { IconComponent } from './icon.component';

/** Le resultat d'une verification : vert avec une coche, rouge avec une croix. Jamais la couleur seule : le texte le dit aussi. */
@Component({
  selector: 'app-verdict',
  imports: [IconComponent],
  template: `
    @if (verdict(); as v) {
      <div class="verdict" [class.ok]="v.ok" [class.ko]="!v.ok" role="status">
        <app-icon [name]="v.ok ? 'check' : 'x'" [size]="22" />
        <div>
          <b>{{ v.title }}</b>
          <small>{{ v.detail }}</small>
        </div>
      </div>
    }
  `,
})
export class VerdictComponent {
  readonly verdict = input<Verdict | null>(null);
}
