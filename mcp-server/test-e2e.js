import { ClaimApiClient } from './client.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAuthTools } from './tools/authTools.js';
import { registerPolicyTools } from './tools/policyTools.js';
import { registerClaimTools } from './tools/claimTools.js';

const API_BASE_URL = process.env.API_BASE_URL;
if (!API_BASE_URL || !process.env.TEST_EMPLOYEE_PASSWORD || !process.env.TEST_FINANCE_PASSWORD) throw new Error('Configure an isolated API_BASE_URL, TEST_EMPLOYEE_PASSWORD and TEST_FINANCE_PASSWORD before running this mutating test');
const RECEIPT_IMAGE = 'C:\\Users\\ravin\\Downloads\\image (7).png';

async function runE2ETest() {
  console.log('====================================================');
  console.log('🚀 STARTING MCP END-TO-END VERIFICATION TEST');
  console.log(`Backend API: ${API_BASE_URL}`);
  console.log(`Frontend URL: https://claim-settle-management-gyjm.vercel.app/`);
  console.log(`Receipt File: ${RECEIPT_IMAGE}`);
  console.log('====================================================\n');

  const apiClient = new ClaimApiClient(API_BASE_URL);
  const server = new McpServer({ name: 'test-runner', version: '1.0.0' });

  // Map to hold tool handlers
  const registeredTools = new Map();
  server.tool = (name, desc, schema, handler) => {
    registeredTools.set(name, handler);
  };

  registerAuthTools(server, apiClient);
  registerPolicyTools(server, apiClient);
  registerClaimTools(server, apiClient);

  console.log(`Registered ${registeredTools.size} MCP Tools:`, Array.from(registeredTools.keys()).join(', '));
  console.log('');

  // -------------------------------------------------------------------
  // TEST 1: Employee Authentication (Test Employee from image (7).png)
  // -------------------------------------------------------------------
  console.log('--- [TEST 1] Employee Login (test@theyellow.network) ---');
  const empLoginRes = await registeredTools.get('login')({
    email: 'test@theyellow.network',
    password: process.env.TEST_EMPLOYEE_PASSWORD
  });
  console.log(empLoginRes.content[0].text);
  if (empLoginRes.isError) throw new Error('Employee login failed');

  const whoamiEmp = await registeredTools.get('get_current_user')({});
  console.log(whoamiEmp.content[0].text);
  console.log('✅ TEST 1 PASSED\n');

  // -------------------------------------------------------------------
  // TEST 2: Check Company Policy via MCP
  // -------------------------------------------------------------------
  console.log('--- [TEST 2] Query Company Policy via MCP ---');
  const policyRes = await registeredTools.get('get_company_policy')({});
  console.log(policyRes.content[0].text);
  if (policyRes.isError) throw new Error('Policy retrieval failed');
  console.log('✅ TEST 2 PASSED\n');

  // -------------------------------------------------------------------
  // TEST 3: RBAC Security Check - Employee must NOT have finance powers
  // -------------------------------------------------------------------
  console.log('--- [TEST 3] Security Enforcement - Employee attempts finance approval ---');
  const illegalAttempt = await registeredTools.get('finance_review_claim')({
    claimId: 'fake-id-test',
    action: 'approve',
    notes: 'Hacking approval'
  });
  console.log('Security response:', illegalAttempt.content[0].text);
  if (!illegalAttempt.isError || !illegalAttempt.content[0].text.includes('Access Denied')) {
    throw new Error('SECURITY VIOLATION: Employee was allowed to perform finance action!');
  }
  console.log('✅ TEST 3 PASSED: Security correctly blocked employee from finance powers.\n');

  // -------------------------------------------------------------------
  // TEST 4: Submit New Claim with Receipt Image
  // -------------------------------------------------------------------
  console.log('--- [TEST 4] Employee Submits Claim with Receipt Image ---');
  const submitRes = await registeredTools.get('submit_claim')({
    businessUnit: 'General',
    category: 'Travel & Lodging',
    lineItems: [
      {
        date: '2026-10-03',
        subCategory: 'Hotel',
        description: 'Hotel accommodation for client on-site visit - Verified via MCP E2E test',
        amount: 2500,
        currency: 'INR',
        gstTotal: 450
      }
    ],
    filePaths: [RECEIPT_IMAGE]
  });

  console.log(submitRes.content[0].text);
  if (submitRes.isError) throw new Error('Claim submission failed: ' + submitRes.content[0].text);

  // Extract Mongo ID
  const claimIdMatch = submitRes.content[0].text.match(/Database ID:\s*([a-zA-Z0-9_-]+)/);
  if (!claimIdMatch) throw new Error('Could not find Database ID in response');
  const claimId = claimIdMatch[1];
  console.log(`Created Claim Database ID: ${claimId}`);
  console.log('✅ TEST 4 PASSED\n');

  // -------------------------------------------------------------------
  // TEST 5: Employee Lists & Inspects Claim
  // -------------------------------------------------------------------
  console.log('--- [TEST 5] Employee inspects submitted claim details ---');
  const detailsRes = await registeredTools.get('get_claim_details')({ claimId });
  console.log(detailsRes.content[0].text);
  if (detailsRes.isError) throw new Error('Failed to get claim details');
  console.log('✅ TEST 5 PASSED\n');

  // -------------------------------------------------------------------
  // TEST 6: Finance Manager Login (Tester from image (7).png)
  // -------------------------------------------------------------------
  console.log('--- [TEST 6] Finance Manager Login (testing@theyellownetwork.in) ---');
  const financeLoginRes = await registeredTools.get('login')({
    email: 'testing@theyellownetwork.in',
    password: process.env.TEST_FINANCE_PASSWORD
  });
  console.log(financeLoginRes.content[0].text);
  if (financeLoginRes.isError) throw new Error('Finance login failed');

  const whoamiFinance = await registeredTools.get('get_current_user')({});
  console.log(whoamiFinance.content[0].text);
  console.log('✅ TEST 6 PASSED\n');

  // -------------------------------------------------------------------
  // TEST 7: Finance Review & Approval via MCP
  // -------------------------------------------------------------------
  console.log('--- [TEST 7] Finance Manager Approves Claim ---');
  const approveRes = await registeredTools.get('finance_review_claim')({
    claimId: claimId,
    action: 'approve',
    notes: 'Receipt verified and validated against company travel policy. Approved by Finance Manager Tester.'
  });
  console.log(approveRes.content[0].text);
  if (approveRes.isError) throw new Error('Finance approval failed: ' + approveRes.content[0].text);
  console.log('✅ TEST 7 PASSED\n');

  // -------------------------------------------------------------------
  // TEST 8: Settle & Mark as Paid via Bank Transfer
  // -------------------------------------------------------------------
  console.log('--- [TEST 8] Finance Manager Settles Claim (Mark Paid) ---');
  const settleRes = await registeredTools.get('settle_claim_payment')({
    claimId: claimId,
    channel: 'Bank Transfer'
  });
  console.log(settleRes.content[0].text);
  if (settleRes.isError) throw new Error('Settlement failed: ' + settleRes.content[0].text);
  console.log('✅ TEST 8 PASSED\n');

  // -------------------------------------------------------------------
  // TEST 9: Final Status Verification
  // -------------------------------------------------------------------
  console.log('--- [TEST 9] Final Verification of Settled Claim ---');
  const finalDetails = await registeredTools.get('get_claim_details')({ claimId });
  console.log(finalDetails.content[0].text);
  if (!finalDetails.content[0].text.includes('PAID')) {
    throw new Error('Claim was not marked as PAID!');
  }
  console.log('✅ TEST 9 PASSED: Claim is fully SETTLED & PAID!\n');

  console.log('====================================================');
  console.log('🎉 ALL 9 END-TO-END TESTS PASSED SUCCESSFULLY!');
  console.log(`View live on frontend: https://claim-settle-management-gyjm.vercel.app/claims/${claimId}`);
  console.log('====================================================');
}

runE2ETest().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
