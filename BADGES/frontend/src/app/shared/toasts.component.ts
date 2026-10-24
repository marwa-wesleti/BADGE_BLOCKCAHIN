import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-toasts',
  imports: [IconComponent],
  template: `
    <div class="toasts" aria-live="polite" aria-atomic="false">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class]="'toast toast-' + t.kind" role="status">
          <span class="toast-text">
            {{ t.text }}
            @if (t.href) {
              <a [href]="t.href" target="_blank" rel="noopener">{{ t.linkLabel ?? 'Voir' }} <app-icon name="external" [size]="14" /></a>
            }
          </span>
          <button type="button" class="toast-close" aria-label="Fermer ce message" (click)="toasts.dismiss(t.id)">
            <app-icon name="x" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  protected readonly toasts = inject(ToastService);
}
