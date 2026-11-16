import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { type Run, type Ticket, TicketSchema } from '@triage/contracts';
import { ZodValidationPipe } from '@triage/service-kit';
import { TICKET_TRIAGE, type TicketTriage } from '../../domain/triage/ticket-triage';

@Controller('triage')
export class TriageController {
  constructor(@Inject(TICKET_TRIAGE) private readonly tickets: TicketTriage) {}

  /** 200 even when the agent escalates because of a model failure: the run itself succeeded. */
  @Post()
  @HttpCode(200)
  async triage(@Body(new ZodValidationPipe({ schema: TicketSchema })) ticket: Ticket): Promise<Run> {
    return (await this.tickets.triage({ ticket })).run;
  }
}
