import { z } from 'zod';
import Claim from '../../models/Claim.js';
import { ok, handle } from './result.js';

const CLAIM_STATUSES = ['submitted', 'approved', 'finance_approved', 'paid', 'rejected'];

// Accepts either a 24-hex Mongo _id or a human claim reference (e.g. claim_2026_00147).
// Only the id is looked up here; the API call that follows still enforces access.
async function resolveClaimMongoId(idOrRef) {
  if (/^[0-9a-fA-F]{24}$/.test(idOrRef)) return idOrRef;
  const claim = await Claim.findOne({ claimId: idOrRef }).select('_id').lean();
  if (!claim) throw new Error(`No claim found with reference ${idOrRef}`);
  return claim._id.toString();
}

function formatClaimRow(c, index) {
  const id = c.claimId || c._id;
  const employee = c.employeeId?.name ? ` | Employee: ${c.employeeId.name}` : '';
  const amt = c.grandTotal || c.amount || 0;
  const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A';
  return `${index + 1}. [${(c.status || 'SUBMITTED').toUpperCase()}] ID: ${id} (DB ID: ${c._id})${employee} | ₹${amt.toLocaleString()} | Category: ${c.category} | Date: ${date} | BU: ${c.businessUnit}`;
}

export function registerClaimTools(server, { api }) {
  // 1. Submit a new expense claim
  server.registerTool(
    'submit_claim',
    {
      description: 'Submit a new expense claim with line items and optional receipt files. Validates against active company policy.',
      inputSchema: {
        businessUnit: z.enum(['Coinnovation', 'General']).default('General').describe('Business unit (General or Coinnovation)'),
        category: z.string().describe('Expense category (e.g., "Travel & Lodging", "Office & Admin", "Client Entertainment & Business Meals")'),
        lineItems: z.array(z.object({
          date: z.string().describe('Date of expense in YYYY-MM-DD format'),
          subCategory: z.string().describe('Sub-category (e.g., "Hotel", "Flight", "Meals", "Supplies")'),
          description: z.string().describe('Detailed description or business purpose of the expense'),
          amount: z.number().positive().describe('Expense amount'),
          currency: z.enum(['INR', 'USD', 'EUR']).default('INR').describe('Currency (defaults to INR)'),
          gstTotal: z.number().min(0).default(0).describe('GST or tax amount if applicable')
        })).min(1).describe('List of expense line items'),
        attachments: z.array(z.object({
          fileName: z.string().describe('File name including extension, e.g. "hotel-bill.pdf"'),
          mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']).describe('File type'),
          base64: z.string().describe('File content, base64-encoded (max 4MB per file)'),
          lineItemIndex: z.number().int().min(0).default(0).describe('Which line item (0-based) this receipt belongs to'),
          label: z.string().default('supporting_doc').describe('Required policy document label, such as airline_invoice')
        })).max(10).optional().describe('Optional receipt files')
      }
    },
    handle('Failed to submit claim', async ({ businessUnit, category, lineItems, attachments = [] }) => {
      const claimData = {
        businessUnit,
        category,
        lineItems: lineItems.map(item => ({ ...item, amountInINR: item.amount }))
      };

      const formData = new FormData();
      formData.append('claimData', JSON.stringify(claimData));
      const fileMapping = {};
      for (const file of attachments) {
        formData.append('files', new Blob([Buffer.from(file.base64, 'base64')], { type: file.mimeType }), file.fileName);
        fileMapping[file.fileName] = { lineItemIndex: file.lineItemIndex, label: file.label };
      }
      formData.append('fileMapping', JSON.stringify(fileMapping));

      const result = await api.request('/api/claims', { method: 'POST', formData });
      const claim = result.claim || result;
      const totalAmt = claim.grandTotal || lineItems.reduce((acc, i) => acc + i.amount, 0);

      return ok([
        `🎉 Claim submitted successfully!`,
        `-----------------------------------------`,
        `Claim Reference: ${claim.claimId || claim._id}`,
        `Database ID: ${claim._id}`,
        `Category: ${claim.category}`,
        `Business Unit: ${claim.businessUnit}`,
        `Status: ${(claim.status || 'submitted').toUpperCase()}`,
        `Grand Total: ₹${totalAmt.toLocaleString()}`,
        `Line Items Count: ${lineItems.length}`,
        `Attachments: ${attachments.length} file(s) attached`
      ].join('\n'));
    })
  );

  // 2. List claims visible to the caller (the API scopes this by role)
  server.registerTool(
    'list_claims',
    {
      description: 'List claims you can see: your own if you are an employee, your own plus your team\'s if you are a supervisor, and all company claims for finance managers, executives and admins. Supports filtering by status and category.',
      inputSchema: {
        status: z.enum(CLAIM_STATUSES).optional().describe('Filter by status'),
        category: z.string().optional().describe('Filter by category'),
        page: z.number().int().min(1).default(1).describe('Page number (default: 1)'),
        limit: z.number().int().min(1).max(100).default(10).describe('Items per page (default: 10)')
      }
    },
    handle('Failed to list claims', async ({ status, category, page, limit }) => {
      const query = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) query.set('status', status);
      if (category) query.set('category', category);

      const res = await api.request(`/api/claims?${query}`);
      const claims = res.claims || (Array.isArray(res) ? res : []);
      if (claims.length === 0) return ok('No claims found matching your criteria.');

      return ok(`Found ${claims.length} claim(s):\n\n${claims.map(formatClaimRow).join('\n')}`);
    })
  );

  // 3. Get claim details
  server.registerTool(
    'get_claim_details',
    {
      description: 'Get full breakdown of a claim by its ID or reference, including line items, attachments, approval status, and settlement details.',
      inputSchema: {
        claimId: z.string().describe('The Mongo ObjectId or claim reference (e.g. claim_2026_00147)')
      }
    },
    handle('Failed to fetch claim details', async ({ claimId }) => {
      const res = await api.request(`/api/claims/${await resolveClaimMongoId(claimId)}`);
      const claim = res.claim || res;

      const lines = [
        `📄 Claim Details: ${claim.claimId || claim._id}`,
        `=========================================`,
        `Database ID: ${claim._id}`,
        `Status: ${(claim.status || 'SUBMITTED').toUpperCase()}`,
        `Employee: ${claim.employeeId?.name || 'N/A'} (${claim.employeeId?.email || 'N/A'})`,
        `Business Unit: ${claim.businessUnit}`,
        `Category: ${claim.category}`,
        `Grand Total: ₹${(claim.grandTotal || claim.amount || 0).toLocaleString()}`,
        `Net Payable: ₹${(claim.netPayable || claim.grandTotal || 0).toLocaleString()}`,
        `Created At: ${claim.createdAt ? new Date(claim.createdAt).toLocaleString() : 'N/A'}`,
        ``,
        `Line Items (${(claim.lineItems || []).length}):`
      ];

      (claim.lineItems || []).forEach((item, i) => {
        const itemDate = item.date ? new Date(item.date).toLocaleDateString() : 'N/A';
        lines.push(`  ${i + 1}. [${itemDate}] ${item.subCategory}: ${item.description}`);
        lines.push(`     Amount: ₹${item.amountInINR || item.amount} (GST: ₹${item.gstTotal || 0})`);
        if (item.attachments?.length > 0) {
          lines.push(`     Receipt Attachments (${item.attachments.length}):`);
          item.attachments.forEach(att => {
            lines.push(`       📎 ${att.name || 'Receipt'} (Key: ${att.storageKey || 'N/A'})`);
            if (att.url) lines.push(`          URL: ${att.url}`);
          });
        }
      });

      lines.push('');
      lines.push('Approval & Settlement Status:');
      lines.push(`- Finance Approval: ${claim.financeApproval?.status || 'Pending'}`);
      if (claim.financeApproval?.approvedBy) {
        lines.push(`  ↳ Approved by: ${claim.financeApproval.approvedBy.name || claim.financeApproval.approvedBy} at ${claim.financeApproval.approvedAt}`);
      }
      if (claim.payment?.paidBy) {
        lines.push(`- Payment: PAID via ${claim.payment.channel} on ${new Date(claim.payment.paidAt).toLocaleDateString()}`);
      } else {
        lines.push(`- Payment: Unpaid`);
      }

      return ok(lines.join('\n'));
    })
  );

  // 4. Finance Review Claim (approve / reject)
  server.registerTool(
    'finance_review_claim',
    {
      description: 'Review a claim as finance manager. Approves for payment or rejects. (Finance managers only.)',
      inputSchema: {
        claimId: z.string().describe('Claim ID or reference to approve or reject'),
        action: z.enum(['approve', 'reject']).describe('Action: "approve" or "reject"'),
        reason: z.string().optional().describe('Reason for rejection (required if rejecting)'),
        notes: z.string().optional().describe('Optional notes for audit records')
      }
    },
    handle('Finance review failed', async ({ claimId, action, reason, notes }) => {
      if (action === 'reject' && !reason) {
        throw new Error('A reason must be provided when rejecting a claim.');
      }

      const res = await api.request(`/api/claims/${await resolveClaimMongoId(claimId)}/finance-approve`, {
        method: 'POST',
        json: { action, notes, reason }
      });

      return ok(`✅ Claim ${claimId} finance review processed: ${action.toUpperCase()}.\nStatus: ${res.claim?.status || res.status || 'Updated'}`);
    })
  );

  // 5. Settle Claim Payment
  server.registerTool(
    'settle_claim_payment',
    {
      description: 'Mark a finance-approved claim as settled and paid. (Finance managers and admins only.)',
      inputSchema: {
        claimId: z.string().describe('Claim ID or reference to mark as paid'),
        channel: z.enum(['Bank Transfer', 'Cash', 'Check']).default('Bank Transfer').describe('Payout channel')
      }
    },
    handle('Settlement failed', async ({ claimId, channel }) => {
      await api.request(`/api/claims/${await resolveClaimMongoId(claimId)}/mark-paid`, {
        method: 'POST',
        json: { channel }
      });

      return ok(`💰 Claim ${claimId} successfully settled and marked as PAID!\nChannel: ${channel}\nPaid At: ${new Date().toLocaleString()}`);
    })
  );

  // 6. Claim Analytics and Summary
  server.registerTool(
    'get_claim_stats',
    {
      description: 'Get claim statistics: total count, total amount, and breakdown by status, for the claims you can see (or only your own).',
      inputSchema: {
        ownOnly: z.boolean().default(false).describe('Only count your own claims')
      }
    },
    handle('Failed to fetch claim stats', async ({ ownOnly }) => {
      const res = await api.request(`/api/claims/stats${ownOnly ? '?scope=own' : ''}`);

      const breakdown = (res.statusStats || [])
        .map(s => `  • ${(s._id || 'UNKNOWN').toUpperCase()}: ${s.count} claim(s), ₹${(s.totalAmount || 0).toLocaleString()}`)
        .join('\n');

      return ok([
        `📊 Claim Settlement Analytics`,
        `---------------------------------`,
        `Total Claims: ${res.totalClaims || 0}`,
        `Total Claimed Amount: ₹${(res.totalAmount || 0).toLocaleString()}`,
        ``,
        `Status Breakdown:`,
        breakdown || '  No data available'
      ].join('\n'));
    })
  );
}
