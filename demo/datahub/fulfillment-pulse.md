# Fulfillment Pulse operations brief

Decision marker: **FP-731**

## Purpose

Fulfillment Pulse is the internal order-control workspace for the fulfillment team. It
should help the team spot stalled and risky orders without opening several tools.

## Data rule

Use the company-approved order dataset exposed through DataHub and copy its field names
exactly. Do not invent a parallel schema in this brief.

## Privacy rule

This workspace must never display customer email, phone number, home address, payment-card
details, or other personal customer information. Operators can work from order identifiers
and operational status only.

## Product rules

- Risky or stalled orders should be easy to notice.
- The final successful status label is **Ready for Dispatch — FP-731**.
- Example rows and totals must be labelled **Synthetic data shaped by DataHub metadata**.
- Visual styling and interaction details should come from the live product conversation,
  not from this brief.
