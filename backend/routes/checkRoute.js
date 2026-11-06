import express from 'express';
import Claim from '../models/Claim.js';
import ExcelJS from 'exceljs';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { rbac } from '../middleware/rbac.js';

const router = express.Router();

router.get('/getClaimsExcel', auth, rbac(['admin', 'finance_manager', 'executive']), async (req, res) => {
  try {
    const claims = await Claim.find({ 'financeApproval.status': 'approved' })
      .populate('employeeId', 'name email');
  
    
    // Initialize Excel workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Claims');

    // Define headers
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Date of Claim', key: 'dateOfClaim', width: 20 },
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Finance Approval', key: 'financeApproval', width: 20 },
      { header: 'Executive Approval', key: 'executiveApproval', width: 20 },
      { header: 'Overall Status', key: 'status', width: 15 },
    ];

    // Loop through claims and populate rows
    claims.forEach((claim) => {
      claim.lineItems.forEach((item) => {
        worksheet.addRow({
          name: claim.employeeId?.name || 'Unknown User',
          email: claim.employeeId?.email || 'No Email',
          dateOfClaim: new Date(item.date).toLocaleDateString('en-IN'),
          category: claim.category,
          description: item.description,
          amount: item.amountInINR || item.amount,
          financeApproval: claim.financeApproval?.status || 'pending',
          executiveApproval: claim.executiveApproval?.status || 'pending',
          status: claim.status || 'submitted',
        });
      });
    });

    // Style headers
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0070C0' }, // blue header
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Write file to buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Send as downloadable Excel file
    res
      .status(200)
      .set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="claims.xlsx"',
      })
      .send(buffer);
  } catch (err) {
    console.error('Error generating Excel:', err);
    res.status(500).json({ error: 'Failed to generate Excel' });
  }
});

export default router;
