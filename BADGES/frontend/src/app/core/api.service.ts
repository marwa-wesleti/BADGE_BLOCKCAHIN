import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiResult } from '../models';

/**
 * Seul point de contact avec l'API Java. Ne leve jamais d'erreur HTTP : un refus (401, 403, 409, 422...) est une
 * reponse normale a afficher, pas une exception. Le jeton de connexion est ajoute par l'intercepteur.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  async call<T = ApiBody>(method: 'GET' | 'POST', url: string, body?: unknown, context?: HttpContext): Promise<ApiResult<T>> {
    try {
      const response = await firstValueFrom(this.http.request<T>(method, url, { body, context, observe: 'response' }));
      return { status: response.status, ok: true, data: (response.body ?? {}) as T };
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const unreachable = error.status === 0;
        const hasJson = typeof error.error === 'object' && error.error !== null && !unreachable;
        const data = hasJson
          ? error.error
          : { message: unreachable ? 'Le serveur ne répond pas : est-il démarré ?' : 'Réponse inattendue du serveur' };
        return { status: error.status, ok: false, data: data as ApiBody };
      }
      throw error;
    }
  }

  /**
   * Telecharge un fichier (un PDF) : l'intercepteur ajoute le jeton, ce qu'un simple lien ne ferait pas.
   * Quand le serveur refuse, son message d'erreur JSON arrive lui aussi sous forme de fichier : on le relit.
   */
  async download(url: string): Promise<ApiResult<{ blob: Blob; filename: string }>> {
    try {
      const response = await firstValueFrom(this.http.get(url, { responseType: 'blob', observe: 'response' }));
      const filename = /filename="?([^";]+)"?/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'document.pdf';
      return { status: response.status, ok: true, data: { blob: response.body as Blob, filename } };
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        let message = error.status === 0 ? 'Le serveur ne répond pas : est-il démarré ?' : 'Réponse inattendue du serveur';
        if (error.error instanceof Blob) {
          try {
            message = JSON.parse(await error.error.text()).message ?? message;
          } catch {
            // le corps n'est pas du JSON : on garde le message general
          }
        }
        return { status: error.status, ok: false, data: { success: false, message } };
      }
      throw error;
    }
  }
}
