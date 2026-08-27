/**
 * AI Assist — rule-based Meta template compliance checking (always on, no
 * network) plus optional Mistral-powered rewrite/suggestion calls (only when
 * MISTRAL_API_KEY is configured). The rule engine is the real prevention
 * mechanism; the AI call is an enhancement layered on top of it.
 */
import axios from 'axios';
const FORBIDDEN_PHRASES = ['reply stop', 'bit.ly', 'tinyurl.com', 'goo.gl/'];
const AUTH_KEYWORDS = ['otp', 'code', 'verify', 'verification', 'pin'];
const UTILITY_KEYWORDS = ['order', 'receipt', 'confirmation', 'invoice', 'delivery', 'shipment', 'shipped'];
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
export function checkTemplateContent(input) {
    const issues = [];
    const body = input.bodyText ?? '';
    const trimmedBody = body.trim();
    const push = (severity, code, message, field) => issues.push({ severity, code, message, field });
    // --- Structural / syntax checks (these are what actually caused the real rejection) ---
    if (trimmedBody.startsWith('{{')) {
        push('error', 'STARTS_WITH_VARIABLE', 'Template body cannot start with a variable — lead with real text for context.', 'body');
    }
    if (trimmedBody.endsWith('}}')) {
        push('warning', 'ENDS_WITH_VARIABLE', 'Ending on a bare variable reads as spam-like to Meta\'s review — add closing text.', 'body');
    }
    const varMatches = [...body.matchAll(/\{\{(\d+)\}\}/g)];
    const varNumbers = varMatches.map((m) => parseInt(m[1], 10));
    if (varNumbers.length > 0) {
        const unique = Array.from(new Set(varNumbers)).sort((a, b) => a - b);
        const sequential = unique.every((n, i) => n === i + 1);
        if (!sequential) {
            push('error', 'VARIABLE_NOT_SEQUENTIAL', 'Variables must be numbered sequentially starting at {{1}} with no gaps.', 'body');
        }
        const seen = new Set();
        for (const n of varNumbers) {
            if (seen.has(n)) {
                push('error', 'REPEATED_VARIABLE_NUMBER', `{{${n}}} is used more than once — each numbered variable must appear exactly once.`, 'body');
                break;
            }
            seen.add(n);
        }
    }
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) {
        push('error', 'CONSECUTIVE_VARIABLES', 'Two variables with no real text between them — add context around each variable.', 'body');
    }
    // --- Length checks (Meta's documented limits) ---
    if (body.length > 1024) {
        push('error', 'BODY_TOO_LONG', `Body is ${body.length} characters — Meta's limit is 1024.`, 'body');
    }
    const bodyWithoutVars = body.replace(/\{\{\d+\}\}/g, '').trim();
    if (bodyWithoutVars.length < 10) {
        push('warning', 'BODY_TOO_SHORT', 'Body has very little static content once variables are removed.', 'body');
    }
    if (input.headerText && input.headerText.length > 60) {
        push('error', 'HEADER_TOO_LONG', `Header is ${input.headerText.length} characters — Meta's limit is 60.`, 'header');
    }
    if (input.footerText && input.footerText.length > 60) {
        push('error', 'FOOTER_TOO_LONG', `Footer is ${input.footerText.length} characters — Meta's limit is 60.`, 'footer');
    }
    // --- Quality heuristics ---
    if (body.length > 0) {
        const realRatio = bodyWithoutVars.length / body.length;
        if (realRatio < 0.3) {
            push('warning', 'LOW_REAL_WORD_RATIO', 'Most of the body is variables with little static informative content.', 'body');
        }
    }
    const lowerBody = body.toLowerCase();
    if (input.category === 'AUTHENTICATION') {
        const looksLikeOtp = varNumbers.includes(1) && AUTH_KEYWORDS.some((k) => lowerBody.includes(k));
        if (!looksLikeOtp) {
            push('warning', 'CATEGORY_AUTH_MISMATCH', 'Authentication templates should clearly present a code/OTP with {{1}}.', 'category');
        }
    }
    if (input.category === 'MARKETING' && UTILITY_KEYWORDS.some((k) => lowerBody.includes(k))) {
        push('warning', 'CATEGORY_MARKETING_LOOKS_LIKE_UTILITY', 'This reads like an order/delivery update — consider the Utility category instead.', 'category');
    }
    for (const phrase of FORBIDDEN_PHRASES) {
        if (lowerBody.includes(phrase)) {
            push('error', 'FORBIDDEN_PHRASE', `Contains a phrase Meta commonly rejects: "${phrase}".`, 'body');
        }
    }
    const letters = body.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 0) {
        const upper = body.replace(/[^A-Z]/g, '');
        if (upper.length / letters.length > 0.3) {
            push('warning', 'EXCESSIVE_CAPS', 'More than 30% of letters are uppercase — this hurts Meta\'s quality score.', 'body');
        }
    }
    const emojiCount = (body.match(EMOJI_REGEX) || []).length;
    if (emojiCount > 3) {
        push('warning', 'EXCESSIVE_EMOJI', `${emojiCount} emoji found — consider trimming to keep it professional.`, 'body');
    }
    for (const btn of input.buttons ?? []) {
        if (btn.text && btn.text.length > 25) {
            push('error', 'BUTTON_TEXT_TOO_LONG', `Button "${btn.text}" is ${btn.text.length} characters — Meta's limit is 25.`, 'buttons');
        }
    }
    if ((input.buttons?.length ?? 0) > 10) {
        push('error', 'TOO_MANY_BUTTONS', 'More than 10 buttons — Meta caps buttons at 10.', 'buttons');
    }
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const score = Math.max(0, 100 - errorCount * 25 - warningCount * 8);
    return { ok: errorCount === 0, score, issues };
}
export function isAIAvailable() {
    return !!process.env.MISTRAL_API_KEY;
}
function buildPrompt(input) {
    switch (input.module) {
        case 'template': {
            const { category, bodyText } = input.context;
            const issueList = (input.ruleIssues ?? [])
                .filter((i) => i.severity === 'error')
                .map((i) => `- ${i.code}: ${i.message}`)
                .join('\n');
            return {
                system: 'You rewrite WhatsApp Business message templates so they comply with Meta\'s template policy. ' +
                    'Rules: never start or end the body with a {{n}} variable, number variables sequentially from {{1}} with no gaps or repeats, ' +
                    'never place two variables back to back, keep the body under 1024 characters, keep real informative text around every variable. ' +
                    'Preserve the original {{n}} placeholders and their meaning — do not change what data each variable represents. ' +
                    'Respond with ONLY the rewritten body text, nothing else — no quotes, no explanation.',
                user: `Category: ${category}\nCurrent body: "${bodyText}"\n\nIssues found:\n${issueList || 'general quality pass'}\n\nRewrite the body to fix these issues.`,
            };
        }
        case 'campaign': {
            const { goal, audienceDescription, existingText } = input.context;
            return {
                system: 'You write concise, effective WhatsApp broadcast campaign messages. Keep it under 300 characters, friendly, and specific. ' +
                    'Respond with ONLY the message text, nothing else.',
                user: `Goal: ${goal || 'general update'}\nAudience: ${audienceDescription || 'general contacts'}\n${existingText ? `Current draft: "${existingText}"` : ''}\n\nWrite the campaign message.`,
            };
        }
        case 'segment': {
            const { goal, fields, operators } = input.context;
            return {
                system: `You build audience segment filters for a WhatsApp CRM. Allowed fields: ${(fields || []).join(', ')}. ` +
                    `Allowed operators: ${(operators || []).join(', ')}. ` +
                    'Respond with ONLY a JSON object of shape {"matchType":"all"|"any","conditions":[{"field":string,"operator":string,"value":string}]} — no prose, no markdown fences.',
                user: `Segment goal: ${goal}\n\nPropose the conditions.`,
            };
        }
        case 'flow': {
            const { intent, stepTypes } = input.context;
            return {
                system: `You design WhatsApp chatbot conversation flows. Allowed step types: ${(stepTypes || []).join(', ')}. ` +
                    'Respond with ONLY a JSON object of shape {"steps":[...],"variables":[]}. Every step has "id", "type", "label", "next" (another step\'s id, or null). ' +
                    'Fill in real content per type, not just structure: ' +
                    'a "trigger" step also needs "triggerType" (one of greeting/keyword/always) and "keyword" if triggerType is keyword; ' +
                    'a "message" step also needs "message" — the actual WhatsApp text to send, written for this specific flow, not a placeholder; ' +
                    'a "condition" step also needs "conditionType" (e.g. contains/equals), "value", "truePath", and "falsePath" (both step ids or null) instead of "next"; ' +
                    'a "delay" step also needs "seconds"; ' +
                    'an "action" step also needs "actionType" (handoff/assign_team/tag_contact) and, for assign_team, an actionValue naming the team. ' +
                    'The first step must be type "trigger" and the flow must end with a step of type "end". No prose, no markdown fences.',
                user: `Flow intent: ${intent}\n\nDesign the flow steps with full content, not just structure.`,
            };
        }
    }
}
export async function getAISuggestion(input) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey)
        return null;
    const { system, user } = buildPrompt(input);
    const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            max_tokens: 500,
            temperature: 0.4,
        }, {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 10000,
        });
        const content = response.data?.choices?.[0]?.message?.content?.trim();
        if (!content)
            return null;
        return {
            suggestion: content,
            rationale: `Suggested by ${model} based on ${input.ruleIssues?.length ? 'the compliance issues found' : 'your description'}.`,
            raw: response.data,
        };
    }
    catch (err) {
        return null;
    }
}
/**
 * Simple-mode AI Reply: a direct system-prompt + user-message call with no
 * retrieval step — the "just describe your business" alternative to the
 * knowledge-base-backed RAG path in knowledgeBase.ts, for tenants who want
 * an AI chatbot without setting up a knowledge base first.
 */
export async function generateSimpleReply(params) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey)
        return null;
    const model = process.env.MISTRAL_MODEL || 'mistral-small-latest';
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model,
            messages: [
                { role: 'system', content: params.systemPrompt },
                { role: 'user', content: params.userMessage },
            ],
            max_tokens: 300,
            temperature: 0.5,
        }, {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 15000,
        });
        const content = response.data?.choices?.[0]?.message?.content?.trim();
        return content || null;
    }
    catch (err) {
        return null;
    }
}
//# sourceMappingURL=aiAssist.js.map