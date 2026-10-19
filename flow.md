# Chatbot Flows

This guide describes how the Chatbot Flows feature currently works in Kriscel WA, including setup, publishing, inbound message handling, AI replies, and troubleshooting.

## What it does

Chatbot Flows is a tenant-scoped visual builder for automated WhatsApp conversations. A flow is saved as ordered steps, can be assigned to connected WhatsApp phone numbers, and can be activated to run when an inbound webhook creates or updates a conversation. Flows can send text messages, evaluate conditions, wait briefly, hand a conversation to a human, or generate an AI reply.

The flow list shows each flow's active state, whether it is the default, step count, execution count, and last update. Flow executions are recorded by the API and can be queried from the execution-history endpoint.

## Creating and editing a flow

1. Sign in to a tenant account and open **Chatbot Flows** from the app menu.
2. Select **New Flow**, enter a name, and optionally add a description.
3. Optionally select **Set as default flow**. Creating a flow this way opens the visual editor.
4. Alternatively, choose **Use template** for a Welcome Message, Support Bot, or Order Status starter, or use **Describe your flow** if AI flow suggestions are available for the account.
5. In the visual editor, select a step to configure it. Add steps, move them up or down, or delete them. The trigger step stays at the start.
6. Select **Save** in the editor to persist the step sequence.
7. Return to the flow card and activate the flow when it is ready.

New flows are inactive until activated. Template copies are also inactive. An active flow must either be assigned to a connected phone number or be the tenant's default; otherwise it cannot be selected for an inbound message.

## Step types

- **Trigger:** Offers `First msg`, `Keyword`, and `Always` configuration. The current executor starts at the first trigger step but does not enforce these trigger settings as a filter. For keyword-based branching, use a Condition step and verify the behavior with an actual inbound message.
- **Send Message:** Sends the configured text through the connected WhatsApp sender. `{{contact_name}}`, `{{business_name}}`, and `{{agent_name}}` are offered in the editor; confirm variable substitution in the current runtime before relying on them, because the executor currently dispatches the configured text directly.
- **AI Reply:** Generates and sends a response to the inbound text. In **Simple** mode, enter a business description. In **Knowledge Base** mode, choose a knowledge base that contains successfully embedded documents. Add allowed topics, optional house rules, and a fallback message. If AI is unavailable, the message is empty, or a confident answer cannot be produced, the configured fallback (or the built-in human-help fallback) is sent.
- **Condition:** Checks the inbound text for `contains`, `equals`, or `starts_with`, and follows its true or false route. The executor also supports `ends_with`, although the editor does not currently offer it. `has_tag` is displayed by the editor but is not implemented by the current executor. The visual editor links the true route to the next step; more complex branching should be tested carefully.
- **Wait / Delay:** Pauses before the next step. Although the editor accepts durations up to 24 hours, the current API executor caps each wait at 120 seconds and waits in the request's background task; it does not use the BullMQ behavior mentioned in the editor.
- **Action:** The editor offers human handoff, assign agent/team, close, add tag, and webhook. The current executor implements **human handoff**; the other action choices do not yet perform their described operations.
- **End Flow:** Completes the flow.

## Assigning phone numbers and default behavior

If a tenant has multiple connected numbers, use **Assign** on a flow card and select the WhatsApp number(s) that flow should answer. The API first looks for an active flow assigned to the conversation's phone number. If none matches, it looks for an active flow marked as the default. A flow with no assigned numbers and not marked default will not run.

Only set one intended default flow per tenant. Saving a flow as default unsets the default flag on the other flows. If multiple active flows are assigned to the same number, the API selects one matching flow; avoid overlapping assignments so behavior is predictable.

## What happens to an inbound WhatsApp message

1. Meta sends the inbound event to the configured webhook.
2. Kriscel WA records the inbound message and updates the conversation.
3. If the conversation's bot is active and does not already have an active flow execution, the API starts the matching number-specific flow or falls back to the active default flow.
4. The executor follows the saved step links in order, sends outbound text/AI replies using the tenant's WhatsApp credentials, and marks the execution complete or handed off.

The automatic webhook trigger passes inbound text to the flow. It skips the flow when the bot is paused for that conversation, or when an execution is already active. A manual trigger is also available through `POST /api/v1/automation/trigger` and requires a conversation ID.

## Knowledge bases for AI replies

1. Select **Knowledge Bases** on the Chatbot Flows page.
2. Create a knowledge base.
3. Add text documents such as FAQs, support instructions, product details, or policies. Documents are chunked and embedded by the API; check that each document status is **EMBEDDED** rather than **FAILED**.
4. Use the knowledge base's test-question feature to preview an answer.
5. In the flow editor, add an **AI Reply** step, choose **Knowledge Base**, and select the knowledge base.
6. Save and activate the flow.

Embedding and AI replies require an AI provider and valid server-side credentials. If configuration is missing, the document may fail to embed or the AI step will use its fallback message.

## Useful API routes

These routes are mounted under the API's versioned prefix (typically `/api/v1`):

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/automation/flows` | List tenant flows |
| `POST` | `/automation/flows` | Create a flow |
| `GET` | `/automation/flows/:flowId` | Read flow details |
| `PUT` | `/automation/flows/:flowId` | Update flow settings or steps |
| `POST` | `/automation/flows/:flowId/activate` | Activate a flow |
| `POST` | `/automation/flows/:flowId/deactivate` | Deactivate a flow |
| `GET` | `/automation/executions` | Read execution history; supports `page`, `limit`, and `flowId` |
| `GET` | `/automation/templates` | List built-in templates |
| `POST` | `/automation/flows/suggest` | Generate a flow suggestion using configured AI |
| `GET/POST` | `/knowledge-bases` | List or create tenant knowledge bases |
| `POST` | `/knowledge-bases/:id/documents` | Add and embed a text document |
| `POST` | `/knowledge-bases/:id/test` | Test a question against a knowledge base |

Flow and knowledge-base routes are tenant-scoped and protected by the corresponding `flows` permissions.

## Demo walkthrough

For a simple demo, create a flow named **Welcome and Support**, add a trigger, an AI Reply step using a business description or an embedded FAQ knowledge base, and an End step. Save it, assign it to a test WhatsApp number (or set it as default), activate it, then send a message from a reachable test WhatsApp account. Show the resulting conversation in **Conversations** and confirm the flow's execution count or inspect `GET /automation/executions`. To demonstrate human handoff, replace End with the implemented human-handoff action and show that the conversation's bot is paused for an agent.

Use a test recipient and verify WhatsApp credentials, webhook delivery, and any applicable WhatsApp messaging rules before testing messages with real customers.

## Troubleshooting checklist

- **No reply:** Confirm the flow is active, assigned to the inbound number or set as the active default, the conversation bot is active, and the WhatsApp webhook is reaching the API.
- **Flow never starts:** Check that the matching flow has an assigned phone number or is default. An active but unassigned non-default flow is not enough.
- **AI fallback reply:** Check the AI provider configuration, the business description or selected knowledge base, and document embedding statuses.
- **Delay/action differs from editor:** Remember the current runtime caps delays at 120 seconds and only implements the human-handoff action. Trigger selection and some condition options shown in the editor are not currently enforced/implemented.
- **Outbound delivery fails:** Inspect the outgoing message status and API logs; confirm the connected sender has valid tenant credentials and the destination can receive WhatsApp messages.

