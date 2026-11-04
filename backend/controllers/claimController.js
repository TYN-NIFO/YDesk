import Claim from '../models/Claim.js';
import User from '../models/User.js';
import Policy from '../models/Policy.js';
import AuditLog from '../models/AuditLog.js';
import storageService from '../services/storage.js';
import { pipeline } from 'node:stream/promises';
import { canAccessClaim } from '../middleware/rbac.js';
import { validationResult } from 'express-validator';
const debug = (...args) => { if (process.env.DEBUG_CLAIMS === 'true') console.log(...args); };

// Create audit log entry
const createAuditLog = async (userId, action, resource, details = {}) => {
  try {
    await AuditLog.create({
      userId,
      action,
      resource,
      details
    });
  } catch (error) {
    console.error('Audit log creation failed:', error);
  }
};

// Get claims based on user role
const getClaims = async (req, res) => {
  try {
    const { status, category, page = 1, limit = 10 } = req.query;
    const user = req.user;
    const filter = {};

    debug('🔍 getClaims called with:', {
      userRole: user.role,
      userEmail: user.email,
      queryParams: req.query
    });

    // Apply status and category filters
    if (status) filter.status = status;
    if (category) filter.category = category;

    // Role-based filtering
    if (user.role === 'employee') {
      filter.employeeId = user._id;
      debug('👤 Employee filter:', filter);
    }
    // Finance managers, executives, and admins see ALL claims (no filter applied)
    debug('🔍 Final filter:', filter);

    const claims = await Claim.find(filter)
      .populate('employeeId', 'name email')
      .populate('financeApproval.approvedBy', 'name email')
      .populate('payment.paidBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Claim.countDocuments(filter);

    debug('📊 Results:', {
      claimsFound: claims.length,
      totalCount: count,
      userRole: user.role
    });

    res.json({
      claims,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      totalClaims: count
    });
  } catch (error) {
    console.error('Get claims error:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
};

// Get claim by ID
const getClaimById = async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.id)
      .populate('employeeId', 'name email department')
      .populate('financeApproval.approvedBy', 'name email')
      .populate('payment.paidBy', 'name email');

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Generate S3 URLs for attachments that are missing the url field
    const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME || 'tyn-claims-app-storage-prod';
    const S3_REGION = process.env.AWS_REGION || 'us-east-1';

    const fixAttachments = (attachments) => {
      if (!attachments || !Array.isArray(attachments)) return attachments;
      return attachments.map(att => {
        if (!att.url && att.storageKey) {
          return {
            ...att,
            url: `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${att.storageKey}`
          };
        }
        return att;
      });
    };

    // Convert to plain object and stringify ObjectIds for safe frontend comparison
    const claimObj = JSON.parse(JSON.stringify(claim.toObject()));

    // Fix top-level attachments
    claimObj.attachments = fixAttachments(claimObj.attachments);

    // Fix line item attachments
    if (claimObj.lineItems) {
      claimObj.lineItems = claimObj.lineItems.map(item => ({
        ...item,
        attachments: fixAttachments(item.attachments)
      }));
    }

    res.json(claimObj);
  } catch (error) {
    console.error('Get claim error:', error);
    res.status(500).json({ error: 'Failed to fetch claim' });
  }
};

// Create new claim
const createClaim = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Extract data from processed claimData (set by route)
    const {
      employeeId,
      businessUnit,
      category,
      advances,
      lineItems,
      grandTotal,
      netPayable,
      createdBy
    } = req.body;

    const user = req.user;

    // Employee assignment validation is handled in the route
    // The route already sets employeeId = req.user._id for employees

    // Totals are already calculated by the route
    // Use the pre-calculated values from the route

    // Initialize claim with common fields (using pre-calculated values from route)
    const claimData = {
      employeeId,
      createdBy: createdBy || user._id,
      businessUnit,
      category,
      advances,
      lineItems,
      grandTotal,
      netPayable,
      policyVersion: req.body.policyVersion,
      violations: req.body.violations,
      totalsByHead: req.body.totalsByHead
      // Status will be set based on user role below
    };

    debug('🔍 User creating claim:', {
      userId: user._id,
      userEmail: user.email,
      userRole: user.role
    });

    claimData.status = 'submitted';

    // Create claim with final data
    debug('📝 Final claim data before save:', {
      status: claimData.status,
      financeApproval: claimData.financeApproval,
      executiveApproval: claimData.executiveApproval,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });

    const claim = new Claim(claimData);

    debug('📝 Claim instance before save:', {
      status: claim.status,
      financeApproval: claim.financeApproval,
    });
    await claim.save();
    debug('✅ Claim after save:', {
      status: claim.status,
      financeApproval: claim.financeApproval,
      _id: claim._id
    });

    // Create audit log
    await createAuditLog(user._id, 'CREATE_CLAIM', 'CLAIM', {
      claimId: claim._id,
      employeeId,
      grandTotal,
      category,
      status: claim.status,
      autoApproved: claim.status !== 'submitted'
    });

    res.status(201).json(claim);
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({ error: 'Failed to create claim' });
  }
};



// Finance manager approval (FIRST APPROVAL)
const financeApprove = async (req, res) => {
  try {
    const { action, notes, reason } = req.body;
    const { user, claim } = req;
    if (!['finance_manager', 'admin'].includes(user.role)) return res.status(403).json({ error: 'Finance or administrator access required' });
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid approval action' });
    if (claim.employeeId.toString() === user._id.toString()) return res.status(403).json({ error: 'Another approver must review your claim' });
    if (claim.status !== 'submitted') return res.status(400).json({ error: 'Claim is not ready for finance approval' });
    const saved = await Claim.findOneAndUpdate(
      { _id: claim._id, status: 'submitted', updatedAt: claim.updatedAt },
      { $set: {
        status: action === 'approve' ? 'finance_approved' : 'rejected',
        financeApproval: { status: action === 'approve' ? 'approved' : 'rejected', approvedBy: user._id, approvedAt: new Date(), notes: notes || '', reason: action === 'reject' ? reason || notes || 'Rejected by reviewer' : undefined }
      } },
      { new: true, runValidators: true }
    );
    if (!saved) return res.status(409).json({ error: 'Claim changed. Refresh before approving.' });
    await createAuditLog(user._id, 'FINANCE_APPROVE', 'CLAIM', { claimId: saved._id, action });
    res.json(saved);
  } catch (error) {
    console.error('Finance approval failed:', error);
    res.status(500).json({ error: 'Failed to process finance review' });
  }
};

const markAsPaid = async (req, res) => {
  try {
    const { channel, reference } = req.body;
    const { user, claim } = req;
    if (!['finance_manager', 'admin'].includes(user.role)) return res.status(403).json({ error: 'Finance or administrator access required' });
    if (claim.status !== 'finance_approved') return res.status(400).json({ error: 'Claim must be finance approved before marking as paid' });
    const policy = await Policy.findOne().sort({ createdAt: -1 });
    if (!policy) return res.status(500).json({ error: 'System policy not configured' });
    if (!policy.payoutChannels.includes(channel)) return res.status(400).json({ error: 'Invalid payout channel' });
    const saved = await Claim.findOneAndUpdate(
      { _id: claim._id, status: 'finance_approved', updatedAt: claim.updatedAt },
      { $set: {
        status: 'paid',
        payment: { paidBy: user._id, paidAt: new Date(), channel, reference: typeof reference === 'string' ? reference.trim() : '' },
        attachments: claim.attachments
      } },
      { new: true, runValidators: true }
    );
    if (!saved) return res.status(409).json({ error: 'Claim changed. Refresh before marking payment.' });
    await createAuditLog(user._id, 'MARK_PAID', 'CLAIM', { claimId: saved._id, channel, reference });
    res.json(saved);
  } catch (error) {
    console.error('Mark payment failed:', error);
    res.status(500).json({ error: 'Failed to mark claim as paid' });
  }
};

// Upload attachment
const uploadAttachment = async (req, res) => {
  try {
    const claim = req.claim;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const policy = await Policy.findOne().sort({ createdAt: -1 });
    if (!policy) {
      return res.status(500).json({ error: 'System policy not configured' });
    }

    // Validate file type
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    if (!policy.allowedFileTypes.includes(fileExtension)) {
      return res.status(400).json({ error: 'File type not allowed' });
    }

    // Validate file size
    if (file.size > policy.maxFileSizeMB * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds limit' });
    }

    const attachment = {
      url: `/uploads/${file.filename}`,
      name: file.originalname,
      mime: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };

    claim.attachments.push(attachment);
    await claim.save();

    // await claim.addTimelineEntry(req.user._id, 'ATTACHMENT_ADDED', `Added attachment: ${file.originalname}`);

    res.json(attachment);
  } catch (error) {
    console.error('Upload attachment error:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
};

// Get claim statistics
const getClaimStats = async (req, res) => {
  try {
    const user = req.user;
    const filter = {};

    // Role-based filtering
    if (user.role === 'employee') {
      filter.employeeId = user._id;
    }

    const stats = await Claim.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const totalClaims = await Claim.countDocuments(filter);
    const totalAmount = await Claim.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      statusStats: stats,
      totalClaims,
      totalAmount: totalAmount[0]?.total || 0
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// Download proxy — fetches S3 file server-side and streams to browser (avoids CORS)
const downloadProxy = async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) return res.status(400).json({ error: 'url param required' });
    const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME || 'tyn-claims-app-storage-prod';
    const S3_REGION = process.env.AWS_REGION || 'us-east-1';
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== `${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`) {
      return res.status(403).json({ error: 'URL not allowed' });
    }
    const storageKey = decodeURIComponent(parsedUrl.pathname.slice(1));
    const claim = await Claim.findOne({ $or: [
      { 'attachments.storageKey': storageKey },
      { 'lineItems.attachments.storageKey': storageKey }
    ] });
    if (!claim) return res.status(404).json({ error: 'Attachment not found' });
    let allowed = false;
    await canAccessClaim({ ...req, params: { id: claim._id }, user: req.user }, res, () => { allowed = true; });
    if (!allowed) return;
    const file = await storageService.get(storageKey);
    const safe = String(filename || 'download').replace(/[^\\w. -]/g, '_');
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    await pipeline(file.body, res);
  } catch (error) {
    console.error('Download proxy error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
};

export {
  getClaims,
  getClaimById,
  createClaim,
  financeApprove,
  markAsPaid,
  uploadAttachment,
  getClaimStats,
  downloadProxy
};
