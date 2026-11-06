import express from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.js';
import { rbac } from '../middleware/rbac.js';
import Policy from '../models/Policy.js';
import { createDefaultPolicy } from '../services/policyValidation.js';

const router = express.Router();

/**
 * @swagger
 * /policy/current:
 *   get:
 *     tags: [Policy Management]
 *     summary: Get current active policy
 *     description: Retrieve the current active expense policy
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 policy:
 *                   $ref: '#/components/schemas/Policy'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/current', auth, async (req, res) => {
  try {
    let policy = await Policy.findOne().sort({ createdAt: -1 });
    
    if (!policy) {
      // Create default policy if none exists
      policy = await createDefaultPolicy();
    }

    res.json({
      success: true,
      policy
    });
  } catch (error) {
    console.error('Policy get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get policy',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /policy:
 *   put:
 *     tags: [Policy Management]
 *     summary: Update or create policy
 *     description: Update the expense policy configuration (Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version, mealCaps, lodgingCaps, requiredDocuments]
 *             properties:
 *               version:
 *                 type: string
 *                 description: Policy version
 *                 example: "1.1.0"
 *               mealCaps:
 *                 type: object
 *                 description: Meal spending limits
 *                 example:
 *                   daily: 2000
 *                   monthly: 50000
 *               lodgingCaps:
 *                 type: object
 *                 description: Lodging spending limits
 *                 example:
 *                   daily: 8000
 *                   monthly: 200000
 *               requiredDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of required document types
 *                 example: ["receipt", "invoice"]
 *               claimCategories:
 *                 type: object
 *                 description: Available claim categories
 *                 example:
 *                   Travel: ["Flights", "Hotels", "Meals"]
 *               maxFileSizeMB:
 *                 type: number
 *                 description: Maximum file size in MB
 *                 example: 10
 *     responses:
 *       200:
 *         description: Policy updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Policy updated successfully"
 *                 policy:
 *                   $ref: '#/components/schemas/Policy'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/', auth, rbac(['admin']), async (req, res) => {
  try {
    const cap = z.number().finite().nonnegative();
    const schema = z.object({
      version: z.string().trim().min(1).max(60),
      mealCaps: z.record(z.string(), z.record(z.string(), cap)),
      lodgingCaps: z.record(z.string(), cap),
      requiredDocuments: z.record(z.string(), z.array(z.string().trim().min(1))),
      mileageRate: cap.optional(),
      cityClasses: z.array(z.enum(['A', 'B', 'C'])).optional(),
      rulesBehavior: z.object({ missingDocuments: z.enum(['hard', 'soft']), capExceeded: z.enum(['hard', 'soft']) }).optional(),
      claimCategories: z.array(z.string().trim().min(1)).min(1).optional(),
      categoryDefinitions: z.array(z.object({ name: z.string().trim().min(1), subCategories: z.array(z.object({ name: z.string().trim().min(1), itc: z.string().optional() })).min(1) })).min(1).optional(),
      payoutChannels: z.array(z.string().trim().min(1)).min(1).optional(),
      maxAmountBeforeFinanceManager: cap.optional(),
      allowedFileTypes: z.array(z.string()).optional(),
      maxFileSizeMB: z.number().positive().max(4).optional(),
      exchangeRates: z.record(z.string(), z.number().finite().positive()).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(issue => issue.message).join('; ') });
    const policyData = parsed.data;
    if (policyData.categoryDefinitions) policyData.claimCategories = policyData.categoryDefinitions.map(category => category.name);
    if (new Set(policyData.claimCategories || []).size !== (policyData.claimCategories || []).length) return res.status(400).json({ error: 'Category names must be unique' });

    // Create new policy version
    const policy = new Policy({
      ...policyData,
      updatedBy: req.user._id
    });

    await policy.save();

    res.json({
      success: true,
      message: 'Policy updated successfully',
      policy
    });
  } catch (error) {
    console.error('Policy update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update policy',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /policy/history:
 *   get:
 *     tags: [Policy Management]
 *     summary: Get policy history
 *     description: Retrieve the history of all policy versions (Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 policies:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "507f1f77bcf86cd799439011"
 *                       version:
 *                         type: string
 *                         example: "1.0.0"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-01T00:00:00Z"
 *                       updatedBy:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "507f1f77bcf86cd799439012"
 *                           name:
 *                             type: string
 *                             example: "Admin User"
 *                           email:
 *                             type: string
 *                             example: "admin@company.com"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/history', auth, rbac(['admin']), async (req, res) => {
  try {
    const policies = await Policy.find()
      .sort({ createdAt: -1 })
      .select('version createdAt updatedBy')
      .populate('updatedBy', 'name email');

    res.json({
      success: true,
      policies
    });
  } catch (error) {
    console.error('Policy history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get policy history',
      details: error.message
    });
  }
});

export default router;
