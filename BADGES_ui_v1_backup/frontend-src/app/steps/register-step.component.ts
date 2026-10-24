import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionRunner } from '../action-runner.service';
import { ApiBody } from '../models';
import { CopyButtonComponent } from '../shared/copy-button.component';
import { SessionService } from '../session.service';
import { short } from '../util';

const HIDDEN_KEY = '••••••••••••••••••••••••';

interface RegisterResponse extends ApiBody {
  user: { walletAddress: string };
  privateKey: string;
}

@Component({
  selector: 'app-register-step',
  imports: [FormsModule, CopyButtonComponent],
  host: {
    class: 'step',
    id: 'step1',
    '[class.done]': 'session.done().register',
    '[class.active]': 'session.activeStep() === 0',
  },
  template: `
    <h2><span class="num">{{ session.done().register ? '✓' : 1 }}</span> Inscription</h2>
    <p class="hint">Crée un portefeuille Ethereum (une paire de clés, calculée sur le serveur).</p>
    <div class="body">
      <div class="row">
        <div>
          <label for="username">Nom d'utilisateur</label>
          <input id="username" [(ngModel)]="username" autocomplete="off">
        </div>
        <div>
          <label for="email">E-mail</label>
          <input id="email" [(ngModel)]="session.email" autocomplete="off">
        </div>
      </div>
      <div class="actions">
        <button class="primary" id="btnRegister" [disabled]="busy()" (click)="register()">Créer mon portefeuille</button>
      </div>

      @if (session.wallet()) {
        <div class="box" id="identity">
          <label style="margin-top: 0">Adresse du portefeuille (publique)</label>
          <div class="mono" id="walletView">{{ session.wallet() }}</div>
          <div class="actions" style="margin-top: 6px">
            <app-copy-button [text]="session.wallet()" label="Copier l'adresse" buttonId="copyWallet" />
            @if (walletUrl(); as url) {
              <a [href]="url" target="_blank" rel="noopener">Voir sur Etherscan ↗</a>
            }
          </div>
          <div class="box warn">
            <b>Clé privée : à noter maintenant.</b> Elle ne sera plus jamais affichée et le serveur ne la conserve pas.
            <div class="mono" id="keyView" style="margin-top: 6px">{{ keyShown() ? session.privateKey() : hiddenKey }}</div>
            <div class="actions" style="margin-top: 6px">
              <button type="button" class="small" id="toggleKey" (click)="keyShown.set(!keyShown())">
                {{ keyShown() ? 'Masquer' : 'Afficher' }}
              </button>
              <app-copy-button [text]="session.privateKey()" buttonId="copyKey" />
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class RegisterStepComponent {
  protected readonly session = inject(SessionService);
  private readonly runner = inject(ActionRunner);

  protected readonly username = signal('alice');
  protected readonly busy = signal(false);
  protected readonly keyShown = signal(false);
  protected readonly hiddenKey = HIDDEN_KEY;
  protected readonly walletUrl = computed(() => this.session.explorerUrl('address', this.session.wallet()));

  protected async register(): Promise<void> {
    this.busy.set(true);
    const result = await this.runner.run<RegisterResponse>(
      'Inscription',
      'POST',
      '/api/users/register',
      { username: this.username(), email: this.session.email() },
      (d) => [{ label: 'Portefeuille', text: short(d.user.walletAddress), href: this.session.explorerUrl('address', d.user.walletAddress) }],
    );
    this.busy.set(false);
    if (result.ok) {
      this.session.wallet.set(result.data.user.walletAddress);
      this.session.privateKey.set(result.data.privateKey);
      this.keyShown.set(false);
      this.session.markDone('register');
    }
  }
}
