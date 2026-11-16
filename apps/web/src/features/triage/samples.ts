import type { Ticket } from '@triage/contracts';
import samples from '../../../../../samples/tickets.json';

/** The sample tickets of the repository (samples/tickets.json), shared with the README and the sample runner. */
export const SAMPLE_TICKETS: { id: string; title: string; ticket: Ticket }[] = samples;
