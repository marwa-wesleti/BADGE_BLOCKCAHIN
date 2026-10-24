import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiResult } from './models';

/**
 * Seul point de contact avec l'API Java. Ne leve jamais d'erreur HTTP : un refus (409, 422...) est une reponse
 * normale a afficher dans le journal, pas une exception.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  async call<T = ApiBody>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<ApiResult<T>> {
    try {
      const response = await firstValueFrom(this.http.request<T>(method, url, { body, observe: 'response' }));
      return { status: response.status, ok: true, data: (response.body ?? {}) as T };
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const unreachable = error.status === 0;
        const hasJson = typeof error.error === 'object' && error.error !== null && !unreachable;
        const data = hasJson
          ? error.error
          : { message: unreachable ? 'Le serveur ne répond pas : est-il démarré ?' : 'Réponse inattendue du serveur' };
        return { status: error.status, ok: false, data: data as T };
      }
      throw error;
    }
  }
}
