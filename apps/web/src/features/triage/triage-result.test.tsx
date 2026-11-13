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

  it('Escalation without a draft', () => {
    render(<TriageResult run={aRun({ result: { action: 'escalate', replyDraft: null } })} />);

    expect(screen.getByText('Escalate to a human')).toBeInTheDocument();
    expect(screen.getByText('No draft: a human writes this reply.')).toBeInTheDocument();
    expect(screen.queryByText('Your lamp ships today.')).not.toBeInTheDocument();
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
    expect(screen.getByText(/Cited articles: refund-policy, damaged-items/)).toHaveTextContent('Model: ollama / qwen3:8b');
  });

  it('says none when no article is cited and shows no refund line without a refund', () => {
    render(<TriageResult run={aRun({ result: { citedArticles: [], refund: null } })} />);

    expect(screen.getByText(/Cited articles: none/)).toBeInTheDocument();
    expect(screen.queryByText(/Proposed refund/)).not.toBeInTheDocument();
  });

  it('shows the raised flags only', () => {
    const flags = { injectionSuspected: true, toolLimitReached: false, policyOverride: true, modelFailure: false };

    render(<TriageResult run={aRun({ result: { action: 'escalate', flags } })} />);

    expect(screen.getByText('Possible prompt injection')).toBeInTheDocument();
    expect(screen.getByText('Policy overrode the model')).toBeInTheDocument();
    expect(screen.queryByText('Model failure')).not.toBeInTheDocument();
  });
});
