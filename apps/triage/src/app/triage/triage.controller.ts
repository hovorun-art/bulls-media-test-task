import { Body, Controller, HttpCode, Inject, Param, Post } from '@nestjs/common';
import {
  type ApprovalRequest,
  ApprovalRequestSchema,
  type Run,
  type Ticket,
  TicketSchema,
  type TriageAccepted,
} from '@triage/contracts';
import { ZodValidationPipe } from '@triage/service-kit';
import { TICKET_TRIAGE, type TicketTriage } from '../../domain/triage/ticket-triage';

@Controller()
export class TriageController {
  constructor(@Inject(TICKET_TRIAGE) private readonly tickets: TicketTriage) {}

  /** 202: the run goes on in the background; GET /api/runs/:id and its events follow it. */
  @Post('triage')
  @HttpCode(202)
  async triage(@Body(new ZodValidationPipe({ schema: TicketSchema })) ticket: Ticket): Promise<TriageAccepted> {
    return { id: (await this.tickets.triage({ ticket })).run.id };
  }

  /** A person's decision on the refund a paused run would propose; answers the run, running again. */
  @Post('runs/:id/approval')
  @HttpCode(200)
  async decide(
    @Param('id') id: string,
    @Body(new ZodValidationPipe({ schema: ApprovalRequestSchema })) body: ApprovalRequest,
  ): Promise<Run> {
    return (await this.tickets.decide({ runId: id, decision: body.decision })).run;
  }
}
