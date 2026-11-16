import type { ModelReadiness } from '../../domain/triage/model-readiness';
import { ModelUnavailableError } from '../../domain/triage/model-unavailable.error';

export interface OllamaModelReadinessParams {
  baseUrl: string;
  model: string;
}

/** Fails the start early, with the command that fixes it, when Ollama or the model is missing. */
export class OllamaModelReadiness implements ModelReadiness {
  constructor(private readonly p: OllamaModelReadinessParams) {}

  async check(): Promise<void> {
    let models: { name: string }[];
    try {
      const response = await fetch(`${this.p.baseUrl}/api/tags`);
      if (!response.ok) throw new Error(`status ${response.status}`);
      models = ((await response.json()) as { models: { name: string }[] }).models;
      if (!Array.isArray(models)) throw new Error('no model list');
    } catch {
      throw new ModelUnavailableError({
        reason: `Ollama is not reachable at ${this.p.baseUrl}; start it with \`ollama serve\``,
      });
    }
    if (!models.some((model) => model.name === this.p.model)) {
      throw new ModelUnavailableError({
        reason: `model ${this.p.model} is not pulled; run \`ollama pull ${this.p.model}\``,
      });
    }
  }
}
