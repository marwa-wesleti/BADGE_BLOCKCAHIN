import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ConfigService } from './core/config.service';
import { ToastsComponent } from './shared/toasts.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastsComponent],
  template: `
    <router-outlet />
    <app-toasts />
  `,
})
export class AppComponent implements OnInit {
  private readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    // la configuration publique (reseau, contrats) et la restauration d'une session eventuelle partent des l'ouverture
    void this.config.load();
    void this.auth.ready();
  }
}
