import type { ModelReadiness } from '../../domain/triage/model-readiness';
import { ModelUnavailableError } from '../../domain/triage/model-unavailable.error';

export interface GeminiModelReadinessParams {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Fails the start early when the Gemini API rejects the key, does not know the model, or is not reachable. */
export class GeminiModelReadiness implements ModelReadiness {
  constructor(private readonly p: GeminiModelReadinessParams) {}

  async check(): Promise<void> {
    let status: number;
    try {
      const response = await fetch(`${this.p.baseUrl}/v1beta/models/${this.p.model}`, { headers: { 'x-goog-api-key': this.p.apiKey } });
      status = response.status;
    } catch {
      throw new ModelUnavailableError({ reason: `the Gemini API is not reachable at ${this.p.baseUrl}` });
    }
    if ([400, 401, 403].includes(status)) {
      throw new ModelUnavailableError({ reason: 'the Gemini API key was rejected; check GOOGLE_API_KEY' });
    }
    if (status === 404) {
      throw new ModelUnavailableError({ reason: `the Gemini API does not know the model ${this.p.model}; check GEMINI_MODEL` });
    }
    if (status !== 200) {
      throw new ModelUnavailableError({ reason: `the Gemini API answered status ${status} at ${this.p.baseUrl}` });
    }
  }
}
