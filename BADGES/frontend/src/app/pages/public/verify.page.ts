import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BackendService } from '../../core/backend.service';
import { ConfigService } from '../../core/config.service';
import { Fact, Verdict } from '../../models';
import { CopyButtonComponent } from '../../shared/copy-button.component';
import { HashInputComponent } from '../../shared/hash-input.component';
import { IconComponent } from '../../shared/icon.component';
import { VerdictComponent } from '../../shared/verdict.component';
import { formatDate, isEthAddress, isSha256, short, verificationLink } from '../../util';

type Tab = 'registre' | 'nft' | 'document';

/**
 * Verification PUBLIQUE : aucun compte, aucun mot de passe. Chaque question est posee directement au contrat
 * (lecture gratuite). C'est l'interet de la blockchain : on n'a pas a croire l'ecole sur parole.
 */
@Component({
  selector: 'app-verify-page',
  imports: [FormsModule, CopyButtonComponent, HashInputComponent, IconComponent, VerdictComponent],
  template: `
    <header class="page-head">
      <h1>Vérifier un badge ou un document</h1>
      <p class="muted">Sans compte et sans payer : la réponse est lue directement dans le contrat, pas dans la base de l’école.</p>
    </header>

    <div class="card">
      <div class="tabs" role="tablist" aria-label="Que vérifier ?">
        <button type="button" role="tab" id="tabRegistre" [class.active]="tab() === 'registre'" [attr.aria-selected]="tab() === 'registre'" (click)="select('registre')">Badge</button>
        <button type="button" role="tab" id="tabNft" [class.active]="tab() === 'nft'" [attr.aria-selected]="tab() === 'nft'" (click)="select('nft')">Badge NFT</button>
        <button type="button" role="tab" id="tabDocument" [class.active]="tab() === 'document'" [attr.aria-selected]="tab() === 'document'" (click)="select('document')">Document</button>
      </div>

      @if (tab() !== 'document') {
        <p class="muted">
          @if (tab() === 'registre') { Le badge du registre existe-t-il pour cette adresse et ce cours ? }
          @else { Existe-t-il un jeton NFT pour cette adresse et ce cours, et à qui appartient-il ? }
        </p>
        <form (ngSubmit)="verifyBadge()" novalidate>
          <div class="form-row">
            <div class="grow">
              <label for="wallet">Adresse du portefeuille de l’élève</label>
              <input id="wallet" name="wallet" class="mono" autocomplete="off" spellcheck="false" placeholder="0x…" [(ngModel)]="wallet">
            </div>
            <div class="narrow">
              <label for="courseId">Numéro du cours</label>
              <input id="courseId" name="courseId" inputmode="numeric" autocomplete="off" [(ngModel)]="courseId">
            </div>
          </div>
          @if (error()) {
            <div class="alert alert-err" role="alert"><app-icon name="alert" /><span>{{ error() }}</span></div>
          }
          <button type="submit" class="btn btn-primary" id="btnVerifyBadge" [disabled]="busy()">
            @if (busy()) { <span class="spin"></span> Lecture du contrat… } @else { <app-icon name="search" /> Vérifier dans le contrat }
          </button>
        </form>
      } @else {
        <p class="muted">Ce document a-t-il été gravé, et n’a-t-il pas changé depuis ?</p>
        @if (linkedHash(); as linked) {
          <div class="alert alert-info" id="linkedHash">
            <app-icon name="shield" />
            <span>Ce lien porte l’empreinte <span class="mono">{{ short(linked) }}</span>. Pour vérifier votre fichier, choisissez-le ci-dessous : son empreinte doit être identique.</span>
          </div>
        }
        <app-hash-input [(hash)]="hash" />
        @if (error()) {
          <div class="alert alert-err" role="alert"><app-icon name="alert" /><span>{{ error() }}</span></div>
        }
        <button type="button" class="btn btn-primary" id="btnVerifyDoc" [disabled]="busy() || !hash()" (click)="verifyDocument()">
          @if (busy()) { <span class="spin"></span> Lecture du contrat… } @else { <app-icon name="search" /> Vérifier ce document }
        </button>
      }

      <app-verdict [verdict]="verdict()" />

      @if (details().length) {
        <dl class="kv kv-wide">
          @for (f of details(); track f.label) {
            <dt>{{ f.label }}</dt>
            <dd><span [class.mono]="f.mono">{{ f.text }}</span></dd>
          }
        </dl>
      }

      @if (shareUrl()) {
        <div class="share">
          <span class="muted">Lien à transmettre pour que quelqu’un refasse cette vérification :</span>
          <app-copy-button [text]="shareUrl()" label="Copier le lien" buttonId="copyShare" />
        </div>
      }
    </div>
  `,
})
export class VerifyPage implements OnInit {
  private readonly backend = inject(BackendService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly config = inject(ConfigService);

  protected readonly tab = signal<Tab>('registre');
  protected readonly wallet = signal('');
  protected readonly courseId = signal('');
  protected readonly hash = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly verdict = signal<Verdict | null>(null);
  protected readonly details = signal<(Fact & { mono?: boolean })[]>([]);
  /** Empreinte portee par un lien de verification (celui du certificat) ; vide si on est venu sans lien. */
  protected readonly linkedHash = signal('');
  protected readonly short = short;
  private readonly verified = signal<{ tab: Tab; wallet: string; courseId: string } | null>(null);

  /** Un lien qui refait la meme verification, seulement pour un badge dont l'existence vient d'etre prouvee. */
  protected readonly shareUrl = computed(() => {
    const v = this.verified();
    return v ? verificationLink(v.tab === 'nft' ? 'nft' : 'registre', v.wallet, v.courseId) : '';
  });

  ngOnInit(): void {
    // un lien partage (?type=nft&adresse=0x…&cours=1) lance la verification tout de suite.
    // On ecoute les parametres (et on ne lit pas un instantane) : ouvrir un autre lien alors qu'on est deja sur cette page
    // reutilise le meme composant, et le nouveau lien serait sinon ignore.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      const type = q.get('type');
      if (type === 'registre' || type === 'nft' || type === 'document') {
        this.tab.set(type);
      }
      const linked = q.get('hash');
      if (type === 'document' && linked && isSha256(linked)) {
        this.linkedHash.set(linked.toLowerCase());
        void this.verifyLinkedHash();
        return;
      }
      const adresse = q.get('adresse');
      const cours = q.get('cours');
      if (adresse && cours) {
        this.wallet.set(adresse);
        this.courseId.set(cours);
        void this.verifyBadge();
      }
    });
  }

  protected select(tab: Tab): void {
    this.tab.set(tab);
    this.reset();
  }

  private reset(): void {
    this.verdict.set(null);
    this.details.set([]);
    this.error.set('');
    this.verified.set(null);
  }

  protected async verifyBadge(): Promise<void> {
    this.reset();
    const wallet = this.wallet().trim();
    const course = this.courseId().trim();
    if (!isEthAddress(wallet)) {
      this.error.set('Adresse invalide : 0x suivi de 40 caractères hexadécimaux.');
      return;
    }
    if (!/^[1-9][0-9]*$/.test(course)) {
      this.error.set('Le numéro du cours doit être un entier à partir de 1.');
      return;
    }
    this.busy.set(true);
    const nft = this.tab() === 'nft';
    const result = await (nft ? this.backend.verifyNft(wallet, course) : this.backend.verifyBadge(wallet, course));
    this.busy.set(false);

    if (!result.ok) {
      this.verdict.set({ ok: false, title: 'Vérification impossible', detail: result.data['message'] ?? 'Erreur du serveur.' });
      return;
    }
    const d = result.data;
    if (!d.valid) {
      this.verdict.set({
        ok: false,
        title: nft ? 'Aucun badge NFT trouvé ✗' : 'Aucun badge trouvé ✗',
        detail: 'Le contrat ne connaît aucun badge pour cette adresse et ce cours.',
      });
      return;
    }
    const issued = formatDate(d.onChain.issuedAt);
    this.verdict.set({
      ok: true,
      title: nft ? 'Badge NFT authentique ✓' : 'Badge authentique ✓',
      detail: nft
        ? `Le jeton n° ${d.onChain.tokenId} appartient à ${short(d.onChain.owner)}, délivré le ${issued}.`
        : `Le smart contract confirme ce badge, délivré le ${issued}.`,
    });
    const facts: (Fact & { mono?: boolean })[] = [];
    if (nft && d.onChain.tokenId != null) {
      facts.push({ label: 'Jeton n°', text: String(d.onChain.tokenId) });
      facts.push({ label: 'Propriétaire', text: d.onChain.owner ?? '', mono: true });
    }
    facts.push({ label: 'Délivré le', text: issued });
    if (d.database) {
      facts.push({ label: 'Élève', text: d.database.user });
      facts.push({ label: 'Cours', text: d.database.course });
    }
    this.details.set(facts);
    this.verified.set({ tab: this.tab(), wallet, courseId: course });
  }

  /** Le lien d'un certificat : on dit tout de suite si l'empreinte est gravée, sans demander le fichier. */
  private async verifyLinkedHash(): Promise<void> {
    this.reset();
    this.busy.set(true);
    const result = await this.backend.verifyHash(this.linkedHash());
    this.busy.set(false);
    if (!result.ok) {
      this.verdict.set({ ok: false, title: 'Vérification impossible', detail: result.data['message'] ?? 'Erreur du serveur.' });
      return;
    }
    this.verdict.set(result.data.valid
      ? { ok: true, title: 'Empreinte gravée ✓', detail: `Cette empreinte a été gravée sur la blockchain le ${formatDate(result.data.anchoredAt)}. Choisissez votre fichier pour vérifier qu’il correspond.` }
      : { ok: false, title: 'Empreinte inconnue ✗', detail: 'Aucune empreinte identique n’a été gravée : ce lien ne correspond à aucun document prouvé.' });
  }

  protected async verifyDocument(): Promise<void> {
    this.reset();
    this.busy.set(true);
    const result = await this.backend.verifyHash(this.hash());
    this.busy.set(false);
    if (!result.ok) {
      this.verdict.set({ ok: false, title: 'Vérification impossible', detail: result.data['message'] ?? 'Erreur du serveur.' });
      return;
    }
    const linked = this.linkedHash();
    if (linked && this.hash() !== linked) {
      // le fichier choisi n'est pas celui du lien : inutile de dire s'il a ete grave, la question posee est "est-ce le bon fichier ?"
      this.verdict.set({ ok: false, title: 'Ce fichier n’est pas celui du certificat ✗',
        detail: 'Son empreinte diffère de celle du lien : le fichier a été modifié, ou c’est un autre fichier. Une seule lettre différente suffit à changer l’empreinte.' });
      return;
    }
    this.verdict.set(result.data.valid
      ? { ok: true, title: 'Document intact ✓', detail: `Son empreinte a été gravée le ${formatDate(result.data.anchoredAt)} : il n’a pas changé depuis.` }
      : { ok: false, title: 'Document inconnu ou modifié ✗', detail: 'Aucune empreinte identique n’a été gravée. Une seule lettre différente suffit à changer l’empreinte.' });
  }
}
