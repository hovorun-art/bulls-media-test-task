import type {
  InjectionGuard,
  InspectInjectionGuardRequest,
  InspectInjectionGuardResponse,
} from '../../domain/guard/injection-guard';

/**
 * Known phrasings of prompt injection. A cheap deterministic first line: it does not catch everything,
 * so the prompts also fence the ticket as untrusted data and the policy step never trusts the model alone.
 */
const PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier|your)\s+(instructions|rules|prompts?|directions)/i,
  /\byou\s+are\s+now\b/i,
  /\b(system|developer)\s+prompt\b/i,
  /\bnew\s+instructions\s*:/i,
  /<\/?\s*(system|assistant|ticket|instructions)\s*>/i,
  /\b(developer|god|jailbreak|dan)\s+mode\b/i,
  /\b(reveal|print|show|repeat)\s+(your|the)\s+(instructions|rules|prompt)/i,
];

export class PatternInjectionGuard implements InjectionGuard {
  inspect(req: InspectInjectionGuardRequest): InspectInjectionGuardResponse {
    const matches = PATTERNS.map((pattern) => pattern.exec(req.text)?.[0]).filter(
      (match): match is string => match !== undefined,
    );
    return { suspected: matches.length > 0, matches };
  }
}
