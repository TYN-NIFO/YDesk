import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { auth } from "../middleware/auth.js";
import { rbac, canAccessClaim } from "../middleware/rbac.js";
import Claim from "../models/Claim.js";
import User from "../models/User.js";
import {
  validateAgainstPolicy,
  computeClaimTotals,
  getCurrentPolicy,
} from "../services/policyValidation.js";
import storageService from "../services/storage.js";
import { prepareClaimUpdate, assertCanAttach, fileAssignment } from "../services/claimSecurity.js";
import { createAuditLog } from "../controllers/authController.js";
import {
  createClaim,
  financeApprove,
  markAsPaid,
  getClaimById
} from "../controllers/claimController.js";
const debug = (...args) => { if (process.env.DEBUG_CLAIMS === 'true') console.log(...args); };

const router = express.Router();
router.use((req, res, next) => {
  req.stagedUploads = [];
  res.once('finish', () => {
    if (res.statusCode >= 400) Promise.allSettled(req.stagedUploads.map(key => storageService.remove(key)));
  });
  next();
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024, // 4MB limit for Vercel free tier compatibility
    files: 10, // Max 10 files per request
    fieldSize: 4 * 1024 * 1024, // 4MB field size limit
  },
  fileFilter: (req, file, cb) => {
    debug("Multer processing file:", {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });

    // Accept PDF files and image files
    const allowedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, JPEG, JPG, and PNG files are allowed"), false);
    }
  },
});

/**
 * @swagger
 * /claims:
 *   post:
 *     tags: [Claims]
 *     summary: Create a new claim
 *     description: Create a new expense claim with line items and file attachments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               claimData:
 *                 type: string
 *                 description: JSON string containing claim data
 *                 example: '{"businessUnit":"Coinnovation","category":"Travel","lineItems":[{"date":"2024-01-15","subCategory":"Meals","description":"Business lunch","amount":1500,"gstTotal":270}]}'
 *               fileMapping:
 *                 type: string
 *                 description: JSON string mapping files to line items
 *                 example: '{"receipt.pdf":0}'
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: File attachments (PDF, JPG, PNG)
 *     responses:
 *       201:
 *         description: Claim created successfully
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
 *                   example: "Claim created successfully"
 *                 claim:
 *                   $ref: '#/components/schemas/Claim'
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", auth, upload.array("files", 50), async (req, res) => {
  try {
    const claimData = JSON.parse(req.body.claimData || "{}");
    if (Array.isArray(claimData.lineItems)) claimData.lineItems = claimData.lineItems.map(item => ({ ...item, attachments: [] }));
    const fileMapping = JSON.parse(req.body.fileMapping || "{}");
    claimData.employeeId = req.user._id;
    claimData.createdBy = req.user._id;

    debug("Claim creation request:", {
      body: req.body,
      processedData: claimData,
      user: req.user._id,

    });

    // Get current policy
    const policy = await getCurrentPolicy();
    if (!policy) {
      return res.status(500).json({ error: "System policy not configured" });
    }

    debug("Policy loaded:", {
      categories: policy.claimCategories,
      policyId: policy._id,
      categoriesLength: policy.claimCategories?.length,
      firstCategory: policy.claimCategories?.[0],
      lastCategory:
        policy.claimCategories?.[policy.claimCategories?.length - 1],
    });

    // Validate claim against policy
    const validation = await validateAgainstPolicy(claimData, policy, { checkDocuments: false });
    const hardErrors = validation.violations.filter((v) => v.level === "error");

    debug("Validation result:", {
      violations: validation.violations,
      hardErrors: hardErrors,
      hardErrorsCount: hardErrors.length,
      claimCategory: claimData.category,
      claimBusinessUnit: claimData.businessUnit,
    });

    if (hardErrors.length > 0) {
      debug("Validation failed with errors:", hardErrors);
      return res.status(400).json({
        error: "Validation failed",
        violations: hardErrors,
        message:
          "Claim has validation errors that must be fixed before submission",
      });
    }

    // Compute totals
    const totals = await computeClaimTotals(claimData, policy);
    claimData.grandTotal = totals.grandTotal;
    claimData.netPayable = totals.netPayable;
    claimData.totalsByHead = totals.totalsByHead;
    // Let the controller handle the status based on user role

    debug("Final claim data before creation:", {
      employeeId: claimData.employeeId,
      createdBy: claimData.createdBy,
      category: claimData.category,
      businessUnit: claimData.businessUnit,
      userId: req.user._id,
    });

    // Process uploaded files and attach to line items
    if (req.files && req.files.length > 0) {
      debug("Processing uploaded files:", req.files.length);

      for (const file of req.files) {
        try {
          // Store file using storage service (returns public URL)
          const result = await storageService.save(file);
          req.stagedUploads.push(result.storageKey);
          const attachment = {
            fileId: result.fileId,
            name: file.originalname,
            size: file.size,
            mime: file.mimetype,
            storageKey: result.storageKey,
            url: result.url, // Public S3 URL
            label: "supporting_doc",
          };

          // Find which line item this file belongs to based on file mapping
          const assignment = fileAssignment(fileMapping, file, claimData.lineItems?.length || 0);
          attachment.label = assignment.label;
          const lineItemIndex = assignment.index;
          if (claimData.lineItems && claimData.lineItems[lineItemIndex]) {
            if (!claimData.lineItems[lineItemIndex].attachments) {
              claimData.lineItems[lineItemIndex].attachments = [];
            }
            claimData.lineItems[lineItemIndex].attachments.push(attachment);
          }
        } catch (fileError) {
          console.error("Error processing file:", file.originalname, fileError);
          throw fileError;
        }
      }
    }

    const finalValidation = await validateAgainstPolicy(claimData, policy);
    if (!finalValidation.isValid) return res.status(400).json({ error: "Validation failed", violations: finalValidation.violations });
    claimData.policyVersion = policy.version;
    claimData.violations = finalValidation.violations;

    // Process the claim creation through the controller
    req.body = claimData;
    return createClaim(req, res);
  } catch (error) {
    console.error("Create claim error:", error);
    console.error("Error in claim creation route:", error);
    res
      .status(500)
      .json({ error: "Failed to create claim", details: error.message });
  }
});

/**
 * @swagger
 * /claims:
 *   get:
 *     tags: [Claims]
 *     summary: Get claims list
 *     description: Retrieve claims based on user role and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [submitted, approved, rejected, finance_approved, paid]
 *         description: Filter by claim status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by claim category
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Claims retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 claims:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Claim'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     total:
 *                       type: integer
 *                       example: 25
 *                     pages:
 *                       type: integer
 *                       example: 3
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
router.get("/", auth, async (req, res) => {
  try {
    const { status, category, page = 1, limit = 10 } = req.query;
    const user = req.user;
    const filter = {};

    debug("\n=== CLAIMS API DEBUG ===");
    debug("User:", {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
    debug("Query params:", { status, category, page, limit });

    // Apply status and category filters
    if (status) filter.status = status;
    if (category) filter.category = category;

    // Role-based filtering - RESTRICT BY DEFAULT
    if (user.role === "admin" || user.role === "executive" || user.role === "finance_manager") {
      // High-level roles see all claims
      debug(`${user.role} - no filter applied (authorized for all)`);
    } else if (user.role === "supervisor") {
      // Supervisors see their own claims + those of their assigned employees
      const subordinates = await User.find({
        $or: [
          { assignedSupervisor1: user._id },
          { assignedSupervisor2: user._id }
        ]
      }).select("_id");
      
      const subordinateIds = subordinates.map(s => s._id);
      filter.employeeId = { $in: [user._id, ...subordinateIds] };
      debug("Supervisor filter applied (own + subordinates):", filter);
    } else {
      // Default / Employee / Unexpected roles only see their own claims
      filter.employeeId = user._id;
      debug(`${user.role || 'Unknown role'} filter applied (own claims only):`, filter);
    }

    debug("Final filter:", JSON.stringify(filter, null, 2));

    const claims = await Claim.find(filter)
      .populate("employeeId", "name email")
      .populate("financeApproval.approvedBy", "name email")
      .populate("payment.paidBy", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    debug("Claims found:", claims.length);
    claims.forEach((claim, index) => {
      debug(
        `${index + 1}. Claim ID: ${claim._id}, Employee: ${claim.employeeId?.name
        } (${claim.employeeId?.email}), Status: ${claim.status}`
      );
    });

    const count = await Claim.countDocuments(filter);
    debug("Total count with filter:", count);

    res.json({
      claims,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    console.error("Get claims error:", error);
    res.status(500).json({ error: "Failed to fetch claims" });
  }
});

// For excel download
router.get("/export", auth, async (req, res) => {
  try {
    const { status, category } = req.query;
    const user = req.user;
    const filter = {};

    debug("Exporting claims for user:", user.email, "with params:", req.query);

    // Apply status and category filters
    if (status) filter.status = status;
    if (category) filter.category = category;

    // Role-based filtering - RESTRICT BY DEFAULT
    if (user.role === "admin" || user.role === "executive" || user.role === "finance_manager") {
      // No filter
    } else if (user.role === "supervisor") {
      const subordinates = await User.find({
        $or: [
          { assignedSupervisor1: user._id },
          { assignedSupervisor2: user._id }
        ]
      }).select("_id");
      const subordinateIds = subordinates.map(s => s._id);
      filter.employeeId = { $in: [user._id, ...subordinateIds] };
    } else {
      filter.employeeId = user._id;
    }

    const claims = await Claim.find(filter)
      .populate("employeeId", "name email department")
      .populate("financeApproval.approvedBy", "name email")
      .populate("payment.paidBy", "name email")
      .sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Claims");

    sheet.columns = [
      { header: "Claim ID", key: "claimId", width: 25 },
      { header: "Date", key: "createdAt", width: 15 },
      { header: "Employee", key: "employee", width: 25 },
      { header: "Department", key: "department", width: 20 },
      { header: "Category", key: "category", width: 20 },
      { header: "Business Unit", key: "businessUnit", width: 20 },
      { header: "Purpose", key: "purpose", width: 30 },
      { header: "Status", key: "status", width: 20 },
      { header: "Line Items", key: "lineItems", width: 12 },
      { header: "Total Amount", key: "grandTotal", width: 15 },
      { header: "Net Payable", key: "netPayable", width: 15 },
      { header: "Finance Approved By", key: "financeApprovedBy", width: 25 },
      { header: "Paid By", key: "paidBy", width: 25 },
    ];

    claims.forEach((claim) => {
      sheet.addRow({
        claimId: claim.claimId || claim._id.toString(),
        createdAt: new Date(claim.createdAt).toLocaleDateString(),
        employee: claim.employeeId?.name || "Unknown",
        department: claim.employeeId?.department || "Unknown",
        category: claim.category,
        businessUnit: claim.businessUnit,
        purpose: claim.purpose || "",
        status: claim.status,
        lineItems: claim.lineItems?.length || 0,
        grandTotal: claim.grandTotal || 0,
        netPayable: claim.netPayable || 0,
        financeApprovedBy: claim.financeApproval?.approvedBy?.name || "",
        paidBy: claim.payment?.paidBy?.name || "",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=claims_export.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export claims error:", error);
    res.status(500).json({ error: "Failed to export claims" });
  }
});

/**
 * @swagger
 * /claims/stats:
 *   get:
 *     tags: [Claims]
 *     summary: Get claim statistics
 *     description: Retrieve claim statistics based on user role
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalClaims:
 *                       type: integer
 *                       example: 25
 *                     pendingClaims:
 *                       type: integer
 *                       example: 5
 *                     approvedClaims:
 *                       type: integer
 *                       example: 15
 *                     rejectedClaims:
 *                       type: integer
 *                       example: 3
 *                     totalAmount:
 *                       type: number
 *                       example: 125000.50
 *                     averageAmount:
 *                       type: number
 *                       example: 5000.02
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
router.get("/stats", auth, async (req, res) => {
  try {
    const user = req.user;
    const { scope } = req.query;
    const filter = {};

    // Role-based filtering - RESTRICT BY DEFAULT
    if (scope === "own") {
      filter.employeeId = user._id;
    } else if (
      user.role === "admin" ||
      user.role === "executive" ||
      user.role === "finance_manager"
    ) {
      // No filter
    } else if (user.role === "supervisor") {
      const subordinates = await User.find({
        $or: [
          { assignedSupervisor1: user._id },
          { assignedSupervisor2: user._id },
        ],
      }).select("_id");
      const subordinateIds = subordinates.map((s) => s._id);
      filter.employeeId = { $in: [user._id, ...subordinateIds] };
    } else {
      filter.employeeId = user._id;
    }

    const stats = await Claim.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$grandTotal" },
        },
      },
    ]);

    const totalClaims = await Claim.countDocuments(filter);
    const totalAmount = await Claim.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } },
    ]);

    res.json({
      statusStats: stats,
      totalClaims,
      totalAmount: totalAmount[0]?.total || 0,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

/**
 * @swagger
 * /claims/{id}:
 *   get:
 *     tags: [Claims]
 *     summary: Get a specific claim
 *     description: Retrieve details of a specific claim by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Claim ID
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Claim retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 claim:
 *                   $ref: '#/components/schemas/Claim'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Claim not found
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
router.get(
  "/:id",
  auth,
  canAccessClaim,
  getClaimById
);

/**
 * @swagger
 * /claims/{id}:
 *   patch:
 *     tags: [Claims]
 *     summary: Update an existing claim
 *     description: Update claim details and add new file attachments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Claim ID
 *         example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               claimData:
 *                 type: string
 *                 description: JSON string containing updated claim data
 *               fileMapping:
 *                 type: string
 *                 description: JSON string mapping files to line items
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: New file attachments
 *     responses:
 *       200:
 *         description: Claim updated successfully
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
 *                   example: "Claim updated successfully"
 *                 claim:
 *                   $ref: '#/components/schemas/Claim'
 *       400:
 *         description: Validation error or claim cannot be updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Cannot update this claim
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Claim not found
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
router.patch(
  "/:id",
  auth,
  canAccessClaim,
  upload.array("files", 50),
  async (req, res) => {
    try {
      const claimId = req.params.id;
      const user = req.user;

      // Parse the request data
      let updateData;
      let fileMapping = {};

      if (req.files && req.files.length > 0) {
        // Handle multipart/form-data (with files)
        updateData = JSON.parse(req.body.claimData || "{}");
        fileMapping = JSON.parse(req.body.fileMapping || "{}");
      } else if (req.is("application/json")) {
        // Handle JSON body
        updateData = req.body;
      } else if (
        req.is("application/x-www-form-urlencoded") ||
        req.is("multipart/form-data")
      ) {
        // Handle form data without files
        updateData = req.body;
        if (typeof updateData.claimData === "string") {
          updateData = JSON.parse(updateData.claimData);
        }
      } else {
        return res.status(400).json({ error: "Invalid content type" });
      }

      debug("Update data received:", {
        updateData,
        filesCount: req.files?.length || 0,
        fileMapping,
      });

      // Ensure required fields are present
      if (!updateData || Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No update data provided" });
      }

      // Find the existing claim (available from canAccessClaim, fallback to DB)
      const existingClaim = req.claim || (await Claim.findById(claimId));
      if (!existingClaim) {
        return res.status(404).json({ error: "Claim not found" });
      }

      // Check permissions - allow updates if:
      // - Admin
      // - Finance manager or Executive (full override)
      // - Owner before finance approval (submitted/rejected)
      const isExecutive = user.role === "executive";
      const canEdit =
        user.role === "admin" ||
        user.role === "finance_manager" ||
        isExecutive ||
        (existingClaim.employeeId.toString() === user._id.toString() &&
          ["submitted", "rejected"].includes(existingClaim.status));

      if (!canEdit) {
        return res.status(403).json({
          error:
            "Cannot edit claim in current status or insufficient permissions",
        });
      }

      updateData = prepareClaimUpdate(updateData, existingClaim);
      const mergedData = { ...existingClaim.toObject(), ...updateData };

      // Get current policy for validation
      const policy = await getCurrentPolicy();
      if (!policy) {
        return res.status(500).json({ error: "System policy not configured" });
      }

      // Validate updated claim against policy
      const validation = await validateAgainstPolicy(mergedData, policy, { checkDocuments: false });
      const hardErrors = validation.violations.filter(
        (v) => v.level === "error"
      );

      if (hardErrors.length > 0) {
        return res.status(400).json({
          error: "Validation failed",
          violations: hardErrors,
          message:
            "Claim has validation errors that must be fixed before submission",
        });
      }

      // Compute new totals
      const totals = await computeClaimTotals(mergedData, policy);
      updateData.grandTotal = totals.grandTotal;
      updateData.netPayable = totals.netPayable;
      updateData.totalsByHead = totals.totalsByHead;
      updateData.lineItems = mergedData.lineItems;

      // Process uploaded files and attach to line items
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            // Store file using storage service
            const result = await storageService.save(file);
          req.stagedUploads.push(result.storageKey);
            const attachment = {
              fileId: result.fileId,
              name: file.originalname,
              size: file.size,
              mime: file.mimetype,
              storageKey: result.storageKey,
              label: "supporting_doc",
            };

            // Find which line item this file belongs to based on file mapping
            const assignment = fileAssignment(fileMapping, file, mergedData.lineItems?.length || 0);
            attachment.label = assignment.label;
            const lineItemIndex = assignment.index;

            // Initialize lineItems array if it doesn't exist
            if (!updateData.lineItems) {
              updateData.lineItems = mergedData.lineItems;
            }

            // Ensure the line item exists
            while (updateData.lineItems.length <= lineItemIndex) {
              updateData.lineItems.push({ attachments: [] });
            }

            // Initialize attachments array if it doesn't exist
            if (!updateData.lineItems[lineItemIndex].attachments) {
              updateData.lineItems[lineItemIndex].attachments = [];
            }

            // Add the new attachment
            updateData.lineItems[lineItemIndex].attachments.push(attachment);
            debug(
              `Added attachment for line item ${lineItemIndex}: ${file.originalname}`
            );
          } catch (fileError) {
            console.error(
              "Error processing file during update:",
              file.originalname,
              fileError
            );
            throw fileError;
          }
        }
      }

      // existingClaim is already available from canAccessClaim middleware

      const finalValidation = await validateAgainstPolicy({ ...mergedData, ...updateData }, policy);
      if (!finalValidation.isValid) return res.status(400).json({ error: "Validation failed", violations: finalValidation.violations });
      updateData.policyVersion = policy.version;
      updateData.violations = finalValidation.violations;

      // Update the claim
      const updatedClaim = await Claim.findOneAndUpdate(
        { _id: claimId, status: existingClaim.status, updatedAt: existingClaim.updatedAt },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!updatedClaim) {
        return res.status(409).json({ error: "Claim changed while editing. Refresh and try again." });
      }

      // Create audit log
      await createAuditLog(user._id, "UPDATE_CLAIM", "CLAIM", {
        claimId: updatedClaim._id,
        changes: Object.keys(updateData),
        filesUploaded: req.files ? req.files.length : 0,
        statusChanged: existingClaim.status !== updatedClaim.status,
      });

      res.json(updatedClaim);
    } catch (error) {
      console.error("Update claim error:", error);
      res.status(error.status || 500).json({ error: error.message || "Failed to update claim" });
    }
  }
);

/**
 * @swagger
 * /claims/{id}/approve:
 *   post:
 *     tags: [Claim Approval]
 *     summary: Approve or reject claim (Supervisor)
 *     description: Supervisor approval/rejection of a claim
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Claim ID
 *         example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *                 description: Approval action
 *                 example: "approve"
 *               reason:
 *                 type: string
 *                 description: Reason for rejection (required if rejecting)
 *                 example: "Missing receipts"
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *                 example: "Approved with conditions"
 *     responses:
 *       200:
 *         description: Claim approval processed successfully
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
 *                   example: "Claim approved successfully"
 *                 claim:
 *                   $ref: '#/components/schemas/Claim'
 *       400:
 *         description: Invalid action or missing reason for rejection
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Supervisor access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Claim not found
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

/**
 * @swagger
 * /claims/{id}/finance-approve:
 *   post:
 *     tags: [Claim Approval]
 *     summary: Finance approval of claim
 *     description: Finance manager approval/rejection of a claim
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Claim ID
 *         example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *                 description: Finance approval action
 *                 example: "approve"
 *               reason:
 *                 type: string
 *                 description: Reason for rejection (required if rejecting)
 *                 example: "Budget exceeded"
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *                 example: "Approved for payment"
 *     responses:
 *       200:
 *         description: Finance approval processed successfully
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
 *                   example: "Claim finance approved successfully"
 *                 claim:
 *                   $ref: '#/components/schemas/Claim'
 *       400:
 *         description: Invalid action or missing reason
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Finance manager access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Claim not found
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
router.post(
  "/:id/finance-approve",
  auth,
  rbac(["finance_manager", "admin"]),
  canAccessClaim,
  async (req, res) => {
    try {
      // The canAccessClaim middleware already sets req.claim, so we don't need to fetch it again
      if (!req.claim) {
        return res.status(404).json({ error: "Claim not found" });
      }

      // Call the controller function
      await financeApprove(req, res);
    } catch (error) {
      console.error("Finance approve claim error:", error);
      res
        .status(500)
        .json({
          error: "Failed to approve claim",
          details: error?.message || "Unknown error",
        });
    }
  }
);

/**
 * @swagger
 * /claims/{id}/mark-paid:
 *   post:
 *     tags: [Claim Payment]
 *     summary: Mark claim as paid
 *     description: Mark a finance-approved claim as paid
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Claim ID
 *         example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               channel:
 *                 type: string
 *                 description: Payment channel/method
 *                 example: "Bank Transfer"
 *               reference:
 *                 type: string
 *                 description: Payment reference number
 *                 example: "TXN123456789"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Mandatory payment proof document
 *     responses:
 *       200:
 *         description: Claim marked as paid successfully
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
 *                   example: "Claim marked as paid successfully"
 *                 claim:
 *                   $ref: '#/components/schemas/Claim'
 *       400:
 *         description: Claim not eligible for payment
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Finance manager or admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Claim not found
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
router.post(
  "/:id/mark-paid",
  auth,
  rbac(["finance_manager", "admin"]),
  upload.single("file"),
  async (req, res) => {
    try {
      // Set the claim in req object for the controller
      req.claim = await Claim.findById(req.params.id);
      if (!req.claim) {
        return res.status(404).json({ error: "Claim not found" });
      }

      // Process file if provided
      if (req.file) {
        // Store file using storage service (returns public URL)
        const result = await storageService.save(req.file);
      req.stagedUploads.push(result.storageKey);
        const fileKey = result.storageKey;

        const attachment = {
          fileId: fileKey,
          name: req.file.originalname,
          size: req.file.size,
          mime: req.file.mimetype,
          storageKey: fileKey,
          url: result.url, // Public S3 URL
          label: "payment_proof",
        };

        req.claim.attachments.push(attachment);
      }

      // Call the controller function
      await markAsPaid(req, res);
    } catch (error) {
      console.error("Mark paid error:", error);
      res.status(500).json({ error: "Failed to mark claim as paid" });
    }
  }
);

/**
 * POST /api/claims/:id/upload
 * Upload attachment to claim
 */
router.post("/:id/upload", auth, canAccessClaim, (req, res, next) => {
  try { assertCanAttach(req.user, req.claim); next(); }
  catch (error) { res.status(error.status || 403).json({ error: error.message }); }
}, upload.single("file"), async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ error: "Claim not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Get current policy for file validation
    const policy = await getCurrentPolicy();
    if (!policy) {
      return res.status(500).json({ error: "System policy not configured" });
    }

    // Validate file type
    const fileExtension = req.file.originalname.split(".").pop().toLowerCase();
    const allowedExtensions = ["pdf", "jpg", "jpeg", "png"];
    if (!allowedExtensions.includes(fileExtension)) {
      return res
        .status(400)
        .json({
          error:
            "File type not allowed. Only PDF, JPG, JPEG, and PNG files are allowed.",
        });
    }

    // Validate file size
    if (req.file.size > (policy.maxFileSizeMB || 10) * 1024 * 1024) {
      return res.status(400).json({ error: "File size exceeds limit" });
    }

    // Store file using storage service (returns public URL)
    const result = await storageService.save(req.file);
      req.stagedUploads.push(result.storageKey);
    const fileKey = result.storageKey;

    const attachment = {
      fileId: fileKey,
      name: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype,
      storageKey: fileKey,
      url: result.url, // Public S3 URL
      label: "attachment",
    };

    claim.attachments.push(attachment);
    await claim.save();

    // Create audit log
    await createAuditLog(req.user._id, "UPLOAD_ATTACHMENT", "CLAIM", {
      claimId: claim._id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });

    res.json(attachment);
  } catch (error) {
    console.error("Upload attachment error:", error);
    res.status(500).json({ error: "Failed to upload attachment" });
  }
});

/**
 * @swagger
 * /claims/{id}:
 *   delete:
 *     tags: [Claims]
 *     summary: Delete a claim
 *     description: Delete a claim (only allowed for submitted claims by owner or admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Claim ID
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Claim deleted successfully
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
 *                   example: "Claim deleted successfully"
 *       400:
 *         description: Claim cannot be deleted (wrong status)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Cannot delete this claim
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Claim not found
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
router.delete("/:id", auth, async (req, res) => {
  try {
    const claimId = req.params.id;
    const user = req.user;

    // Find the claim
    const claim = await Claim.findById(claimId);
    if (!claim) {
      return res.status(404).json({ error: "Claim not found" });
    }

    if (!["submitted", "rejected"].includes(claim.status)) return res.status(403).json({ error: "Approved and settled records cannot be deleted" });

    // Check permissions based on role and claim status
    let canDelete = false;
    let reason = "";

    if (user.role === "admin") {
      canDelete = true;
      reason = "Admin can delete any claim";
    } else if (user.role === "employee" || user.role === "supervisor") {
      // Employees can delete their own claims if not yet approved
      if (claim.employeeId.toString() === user._id.toString()) {
        if (["submitted", "rejected"].includes(claim.status)) {
          canDelete = true;
          reason = "Employee can delete own claim before approval";
        } else {
          reason = `Cannot delete claim with status: ${claim.status}`;
        }
      } else {
        reason = "Can only delete own claims";
      }
    } else if (
      user.role === "finance_manager" ||
      user.role === "executive"
    ) {
      // Finance managers and executives can delete any claim at any time
      canDelete = true;
      reason = `${user.role} can delete any claim`;
    }

    if (!canDelete) {
      return res.status(403).json({
        error: "Permission denied",
        reason: reason,
      });
    }

    // Delete associated files from storage
    if (claim.lineItems && claim.lineItems.length > 0) {
      for (const lineItem of claim.lineItems) {
        if (lineItem.attachments && lineItem.attachments.length > 0) {
          for (const attachment of lineItem.attachments) {
            try {
              await storageService.remove(attachment.storageKey);
              debug(`Deleted file: ${attachment.storageKey}`);
            } catch (fileError) {
              console.error(
                `Failed to delete file ${attachment.storageKey}:`,
                fileError
              );
              // Continue with claim deletion even if file deletion fails
            }
          }
        }
      }
    }

    // Delete the claim
    await Claim.findByIdAndDelete(claimId);

    // Create audit log
    await createAuditLog(user._id, "DELETE_CLAIM", "CLAIM", {
      claimId: claimId,
      employeeId: claim.employeeId,
      category: claim.category,
      grandTotal: claim.grandTotal,
      status: claim.status,
      reason: reason,
    });

    debug(
      `Claim ${claimId} deleted by ${user.role} ${user.name} - ${reason}`
    );

    res.json({
      success: true,
      message: "Claim deleted successfully",
      reason: reason,
    });
  } catch (error) {
    console.error("Delete claim error:", error);
    res.status(500).json({ error: "Failed to delete claim" });
  }
});

/**
 * GET /api/claims/debug-policy
 * Debug endpoint to check current policy
 */
router.get("/debug-policy", auth, async (req, res) => {
  try {
    const policy = await getCurrentPolicy();
    const { validCategories, validBusinessUnits } = await import(
      "../lib/categoryMaster.js"
    );

    res.json({
      policy: {
        id: policy._id,
        categories: policy.claimCategories,
        categoriesCount: policy.claimCategories?.length,
      },
      categoryMaster: {
        categories: validCategories,
        categoriesCount: validCategories.length,
        businessUnits: validBusinessUnits,
      },
      matches: {
        categoriesMatch:
          JSON.stringify(policy.claimCategories) ===
          JSON.stringify(validCategories),
      },
    });
  } catch (error) {
    console.error("Debug policy error:", error);
    res.status(500).json({ error: "Failed to get policy debug info" });
  }
});

// Middleware to check file access permissions
const canAccessFile = async (req, res, next) => {
  const { storageKey } = req.params;
  const user = req.user;

  try {
    // Find the claim that contains this file
    const claim = await Claim.findOne({
      "lineItems.attachments.storageKey": storageKey,
    });

    if (!claim) {
      return res.status(404).json({ error: "File not found" });
    }

    // Admin can access all files
    if (user.role === "admin") {
      req.claim = claim;
      return next();
    }

    // Employee can only access files from their own claims
    if (
      user.role === "employee" &&
      claim.employeeId.toString() === user._id.toString()
    ) {
      req.claim = claim;
      return next();
    }

    // Finance manager and executives can access files from all claims for complete oversight
    if (user.role === "finance_manager" || user.role === "executive") {
      // Finance managers and executives should have access to all claim files for complete oversight
      req.claim = claim;
      return next();
    }

    return res.status(403).json({ error: "Access denied to this file" });
  } catch (error) {
    console.error("Error in canAccessFile:", error);
    res.status(500).json({ error: "Error checking file access" });
  }
};

/**
 * @swagger
 * /claims/files/{storageKey}:
 *   get:
 *     tags: [File Management]
 *     summary: Download claim attachment
 *     description: Download a file attachment from a claim
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storageKey
 *         required: true
 *         schema:
 *           type: string
 *         description: File storage key
 *         example: "507f1f77bcf86cd799439011.pdf"
 *     responses:
 *       200:
 *         description: File downloaded successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - No access to this file
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: File not found
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
// File serving endpoint removed - files are now accessed directly via public S3 URLs
// router.get("/files/:storageKey", auth, canAccessFile, async (req, res) => {
//   // No longer needed - files are publicly accessible via S3 URLs
// });

export default router;
