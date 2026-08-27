/**
 * AI Assist — rule-based Meta template compliance checking (always on, no
 * network) plus optional Mistral-powered rewrite/suggestion calls (only when
 * MISTRAL_API_KEY is configured). The rule engine is the real prevention
 * mechanism; the AI call is an enhancement layered on top of it.
 */
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export interface TemplateCheckInput {
    category: TemplateCategory;
    bodyText: string;
    headerText?: string;
    footerText?: string;
    buttons?: {
        type: string;
        text: string;
    }[];
}
export interface TemplateCheckIssue {
    severity: 'error' | 'warning';
    code: string;
    message: string;
    field: 'body' | 'header' | 'footer' | 'buttons' | 'category';
}
export interface TemplateCheckResult {
    ok: boolean;
    score: number;
    issues: TemplateCheckIssue[];
}
export declare function checkTemplateContent(input: TemplateCheckInput): TemplateCheckResult;
export type AIModule = 'template' | 'campaign' | 'segment' | 'flow';
export interface AISuggestionInput {
    module: AIModule;
    context: Record<string, any>;
    ruleIssues?: TemplateCheckIssue[];
}
export interface AISuggestionResult {
    suggestion: string;
    rationale: string;
    raw?: any;
}
export declare function isAIAvailable(): boolean;
export declare function getAISuggestion(input: AISuggestionInput): Promise<AISuggestionResult | null>;
/**
 * Simple-mode AI Reply: a direct system-prompt + user-message call with no
 * retrieval step — the "just describe your business" alternative to the
 * knowledge-base-backed RAG path in knowledgeBase.ts, for tenants who want
 * an AI chatbot without setting up a knowledge base first.
 */
export declare function generateSimpleReply(params: {
    systemPrompt: string;
    userMessage: string;
}): Promise<string | null>;
//# sourceMappingURL=aiAssist.d.ts.map