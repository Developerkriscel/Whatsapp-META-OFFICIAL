/**
 * Invoice PDF Generation Service
 */
import PDFDocument from 'pdfkit';
export async function generateInvoicePDF(invoice) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            // Header
            doc.fontSize(28).fillColor('#10b981').text('INVOICE', 50, 50);
            doc.fontSize(10).fillColor('#666')
                .text(`#${invoice.number}`, 50, 85)
                .text(`Issued: ${invoice.date.toLocaleDateString()}`, 50, 100)
                .text(`Due: ${invoice.dueDate.toLocaleDateString()}`, 50, 115);
            // Status badge
            const statusColor = invoice.status === 'paid' ? '#10b981'
                : invoice.status === 'failed' ? '#ef4444'
                    : '#6b7280';
            doc.rect(450, 50, 100, 25).fill(statusColor);
            doc.fillColor('#fff').fontSize(11)
                .text(invoice.status.toUpperCase(), 460, 58);
            // Company info
            doc.fillColor('#000').fontSize(12).text(invoice.company.name, 50, 160);
            doc.fontSize(9).fillColor('#666')
                .text(invoice.company.address, 50, 180)
                .text(invoice.company.email, 50, 195);
            if (invoice.company.website) {
                doc.text(invoice.company.website, 50, 210);
            }
            if (invoice.company.taxId) {
                doc.text(`Tax ID: ${invoice.company.taxId}`, 50, 225);
            }
            // Bill to
            doc.fontSize(11).fillColor('#666').text('BILL TO:', 350, 160);
            doc.fontSize(12).fillColor('#000').text(invoice.customer.name, 350, 178);
            doc.fontSize(9).fillColor('#666')
                .text(invoice.customer.email, 350, 196);
            if (invoice.customer.address) {
                doc.text(invoice.customer.address, 350, 211);
            }
            // Items table
            const tableTop = 280;
            doc.fontSize(10).fillColor('#666')
                .text('DESCRIPTION', 50, tableTop)
                .text('QTY', 350, tableTop, { width: 50, align: 'right' })
                .text('PRICE', 410, tableTop, { width: 70, align: 'right' })
                .text('AMOUNT', 490, tableTop, { width: 70, align: 'right' });
            // Divider
            doc.moveTo(50, tableTop + 15)
                .lineTo(560, tableTop + 15)
                .strokeColor('#e5e7eb')
                .stroke();
            // Items
            let y = tableTop + 25;
            doc.fillColor('#000');
            for (const item of invoice.items) {
                doc.fontSize(10).text(item.description, 50, y, { width: 280 });
                doc.text(item.quantity.toString(), 350, y, { width: 50, align: 'right' });
                doc.text(`$${item.unitPrice.toFixed(2)}`, 410, y, { width: 70, align: 'right' });
                doc.text(`$${item.amount.toFixed(2)}`, 490, y, { width: 70, align: 'right' });
                y += 25;
            }
            // Divider
            doc.moveTo(50, y + 5)
                .lineTo(560, y + 5)
                .strokeColor('#e5e7eb')
                .stroke();
            // Totals
            y += 25;
            doc.fontSize(10).fillColor('#666')
                .text('Subtotal', 410, y, { width: 70, align: 'right' })
                .fillColor('#000').text(`$${invoice.subtotal.toFixed(2)}`, 490, y, { width: 70, align: 'right' });
            y += 20;
            doc.fillColor('#666')
                .text(`Tax (${(invoice.tax / invoice.subtotal * 100).toFixed(0)}%)`, 410, y, { width: 70, align: 'right' })
                .fillColor('#000').text(`$${invoice.tax.toFixed(2)}`, 490, y, { width: 70, align: 'right' });
            y += 20;
            doc.moveTo(410, y - 5)
                .lineTo(560, y - 5)
                .strokeColor('#e5e7eb')
                .stroke();
            y += 5;
            doc.fontSize(12).font('Helvetica-Bold')
                .text('Total', 410, y, { width: 70, align: 'right' })
                .fillColor('#10b981').text(`$${invoice.total.toFixed(2)} ${invoice.currency}`, 490, y, { width: 70, align: 'right' });
            // Notes
            if (invoice.notes) {
                doc.font('Helvetica').fontSize(10).fillColor('#666')
                    .text('Notes:', 50, y + 50)
                    .text(invoice.notes, 50, y + 65, { width: 500 });
            }
            // Footer
            doc.fontSize(8).fillColor('#999')
                .text('Thank you for your business!', 50, 750, {
                align: 'center',
                width: 500,
            });
            doc.end();
        }
        catch (err) {
            reject(err);
        }
    });
}
export function buildInvoiceData(invoice, tenant, lineItems) {
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const tax = 0; // Configure based on locale
    const total = subtotal + tax;
    return {
        number: invoice.number,
        date: invoice.createdAt,
        dueDate: invoice.dueDate || new Date(invoice.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        status: invoice.status,
        customer: {
            name: tenant.name,
            email: tenant.billingEmail || `${tenant.id}@whatsapp-saas.com`,
            address: tenant.businessAddress,
        },
        company: {
            name: 'WhatsApp SaaS Inc.',
            address: '123 SaaS Street, San Francisco, CA 94105',
            email: 'billing@whatsapp-saas.com',
            website: 'https://whatsapp-saas.com',
            taxId: 'TAX-12345678',
        },
        items: lineItems.map((item) => ({
            description: item.description,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || item.amount,
            amount: item.amount,
        })),
        subtotal,
        tax,
        total,
        currency: 'USD',
        notes: 'Auto-generated invoice. Please contact billing@whatsapp-saas.com for any questions.',
    };
}
//# sourceMappingURL=invoice.js.map