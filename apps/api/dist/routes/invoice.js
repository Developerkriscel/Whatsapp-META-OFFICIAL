/**
 * Invoice Routes - PDF download and manual invoice generation
 */
import { generateInvoicePDF, buildInvoiceData } from '../services/invoice.js';
export async function registerInvoiceRoutes(app) {
    // ============================================
    // GET /billing/invoices/:invoiceId/pdf - Download PDF
    // ============================================
    app.get('/billing/invoices/:invoiceId/pdf', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { invoiceId } = request.params;
        const invoice = await app.prisma.invoice.findFirst({
            where: {
                id: invoiceId,
                tenantId: request.authUser.tenantId,
            },
        });
        if (!invoice) {
            return reply.status(404).send({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Invoice not found' },
            });
        }
        const tenant = await app.prisma.tenant.findUnique({
            where: { id: request.authUser.tenantId },
        });
        if (!tenant) {
            return reply.status(404).send({ success: false, error: { code: 'TENANT_NOT_FOUND' } });
        }
        // Build line items from invoice
        const lineItems = invoice.lineItems || [
            {
                description: `${tenant.name} - ${invoice.number}`,
                quantity: 1,
                unitPrice: Number(invoice.amount),
                amount: Number(invoice.amount),
            },
        ];
        const invoiceData = buildInvoiceData(invoice, tenant, lineItems);
        const pdfBuffer = await generateInvoicePDF(invoiceData);
        reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`)
            .send(pdfBuffer);
    });
    // ============================================
    // POST /superadmin/billing/tenants/:tenantId/invoice - Generate manual invoice
    // ============================================
    app.post('/superadmin/billing/tenants/:tenantId/invoice', async (request, reply) => {
        if (!request.authUser.isSuperadmin) {
            return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN' } });
        }
        const { tenantId } = request.params;
        const body = request.body;
        const tenant = await app.prisma.tenant.findUnique({
            where: { id: tenantId },
        });
        if (!tenant) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        const invoiceCount = await app.prisma.invoice.count({
            where: { tenantId },
        });
        const invoiceNumber = `INV-${Date.now()}-${(invoiceCount + 1).toString().padStart(4, '0')}`;
        const invoice = await app.prisma.invoice.create({
            data: {
                tenantId,
                number: invoiceNumber,
                status: 'pending',
                amount: body.amount,
                periodStart: body.periodStart ? new Date(body.periodStart) : new Date(),
                periodEnd: body.periodEnd ? new Date(body.periodEnd) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                dueDate: body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                lineItems: body.lineItems || [],
            },
        });
        return reply.status(201).send({ success: true, data: invoice });
    });
}
//# sourceMappingURL=invoice.js.map