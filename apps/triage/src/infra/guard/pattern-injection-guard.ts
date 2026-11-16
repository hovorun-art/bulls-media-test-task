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
  // A new role for the agent, not a complaint ("you are now charging me twice").
  /\byou\s+are\s+now\s+(?:(?:an?|the|my)\s+)?(?:\w+\s+)?(?:assistant|ai|bot|model|admin|administrator|root|developer|system|dan)\b/i,
  /\b(system|developer)\s+prompt\b/i,
  /\bnew\s+instructions\s*:/i,
  /<\/?\s*(system|assistant|ticket|instructions)\s*>/i,
  /\b(developer|god|jailbreak|dan)\s+mode\b/i,
  // The agent's own rules, not the shop's ("show the rules for returns").
  /\b(reveal|print|show|repeat)\s+(your\s+(instructions|rules|prompt)|the\s+(system\s+|hidden\s+|original\s+)?(instructions|prompt)(?!\s+(for|of|on)\b)|the\s+(system|hidden|original)\s+rules)/i,
];

export class PatternInjectionGuard implements InjectionGuard {
  inspect(req: InspectInjectionGuardRequest): InspectInjectionGuardResponse {
    const matches = PATTERNS.map((pattern) => pattern.exec(req.text)?.[0]).filter(
      (match): match is string => match !== undefined,
    );
    return { suspected: matches.length > 0, matches };
  }
}
