import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { aRun } from '../../test-utils';
import { TriageResult } from './triage-result';

describe('TriageResult', () => {
  it('Result shows the decision', () => {
    const run = aRun({
      result: {
        category: 'refund_request',
        action: 'propose_refund',
        replyDraft: 'We are reviewing a refund of 89 USD.',
        summary: 'refund_request, high priority. Action: propose_refund.',
        refund: { orderId: 'A-1002', amount: 89, currency: 'USD' },
      },
    });

    render(<TriageResult run={run} />);

    expect(screen.getByText('Propose refund')).toBeInTheDocument();
    expect(screen.getByText('We are reviewing a refund of 89 USD.')).toBeInTheDocument();
    expect(screen.getByText('refund_request, high priority. Action: propose_refund.')).toBeInTheDocument();
    expect(screen.getByText('Proposed refund: 89 USD for order A-1002 (needs approval)')).toBeInTheDocument();
  });

  it('shows nothing for a run that has no result yet', () => {
    const { container } = render(<TriageResult run={aRun({ status: 'running', result: null })} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('Escalation without a draft', () => {
    render(<TriageResult run={aRun({ result: { action: 'escalate', replyDraft: null } })} />);

    expect(screen.getByText('Escalate to a human')).toBeInTheDocument();
    expect(screen.getByText('No draft: a human writes this reply.')).toBeInTheDocument();
  });

  it('shows the category, priority, reasons, cited articles and model', () => {
    const run = aRun({
      result: {
        category: 'refund_request',
        priority: 'high',
        reasons: ['Delivered 5 days ago', 'Amount 89 USD'],
        citedArticles: ['refund-policy', 'damaged-items'],
      },
    });

    render(<TriageResult run={run} />);

    expect(screen.getByText('Category: refund_request')).toBeInTheDocument();
    expect(screen.getByText('Priority: high')).toBeInTheDocument();
    expect(screen.getByText('Delivered 5 days ago')).toBeInTheDocument();
    expect(screen.getByText('Amount 89 USD')).toBeInTheDocument();
    expect(screen.getByText(/Cited articles: refund-policy, damaged-items/)).toBeInTheDocument();
    expect(screen.getByText(/Model: ollama \/ qwen3:8b/)).toBeInTheDocument();
  });

  it('says none when no article is cited', () => {
    render(<TriageResult run={aRun({ result: { citedArticles: [] } })} />);

    expect(screen.getByText(/Cited articles: none/)).toBeInTheDocument();
  });

  it('shows no refund line without a refund', () => {
    render(<TriageResult run={aRun({ result: { refund: null } })} />);

    expect(screen.queryByText(/Proposed refund/)).not.toBeInTheDocument();
  });

  it.each([
    ['reply', 'Reply'],
    ['propose_refund', 'Propose refund'],
    ['escalate', 'Escalate to a human'],
    ['refuse', 'Refuse'],
  ] as const)('labels the action %s as "%s"', (action, label) => {
    render(<TriageResult run={aRun({ result: { action } })} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    ['injectionSuspected', 'Possible prompt injection'],
    ['toolLimitReached', 'Tool call limit reached'],
    ['policyOverride', 'Policy overrode the model'],
    ['modelFailure', 'Model failure'],
    ['deadlineReached', 'Run deadline reached'],
  ])('shows the flag %s as "%s"', (flag, label) => {
    const flags = { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false, deadlineReached: false };

    render(<TriageResult run={aRun({ result: { action: 'escalate', flags: { ...flags, [flag]: true } } })} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows no flag when none is raised', () => {
    const flags = { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false, deadlineReached: false };

    render(<TriageResult run={aRun({ result: { action: 'escalate', flags } })} />);

    expect(screen.queryByText('Model failure')).not.toBeInTheDocument();
    expect(screen.queryByText('Possible prompt injection')).not.toBeInTheDocument();
  });
});
