import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { JournalService } from './journal.service';
import { ApiBody, ApiResult, Fact } from '../models';

/** Lance un appel a l'API en le racontant dans le journal : "en cours...", puis le resultat. */
@Injectable({ providedIn: 'root' })
export class ActionRunner {
  private readonly api = inject(ApiService);
  private readonly journal = inject(JournalService);

  async run<T = ApiBody>(
    title: string,
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
    factsOf?: (data: T) => Fact[],
  ): Promise<ApiResult<T>> {
    const id = this.journal.start(title);
    const result = await this.api.call<T>(method, url, body);
    this.journal.finish(id, result as ApiResult, result.ok && factsOf ? factsOf(result.data) : []);
    return result;
  }
}
