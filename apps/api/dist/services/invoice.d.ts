/**
 * Invoice PDF Generation Service
 */
interface InvoiceData {
    number: string;
    date: Date;
    dueDate: Date;
    status: string;
    customer: {
        name: string;
        email: string;
        address?: string;
    };
    company: {
        name: string;
        address: string;
        email: string;
        website?: string;
        taxId?: string;
    };
    items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        amount: number;
    }>;
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
    notes?: string;
}
export declare function generateInvoicePDF(invoice: InvoiceData): Promise<Buffer>;
export declare function buildInvoiceData(invoice: any, tenant: any, lineItems: any[]): InvoiceData;
export {};
//# sourceMappingURL=invoice.d.ts.map