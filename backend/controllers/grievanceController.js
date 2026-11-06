import Grievance, {
  GRIEVANCE_CATEGORIES,
  GRIEVANCE_STATUSES,
  GRIEVANCE_TRANSITIONS,
  FEEDBACK_TYPES
} from '../models/Grievance.js';
import { privateStorageService as storageService } from '../services/storage.js';
import { pipeline } from 'node:stream/promises';
import { createAuditLog } from './authController.js';
import { notifyGrievanceCreated, notifyGrievanceStatusChanged } from '../services/grievanceNotifications.js';

const GRIEVANCE_ID_PATTERN = /^(?:grievance|feedback)_\d{4}_\d{5,}$/;

const isHandler = (user) => user.grievanceAccess === 'handler';
const canSeeSummary = (user) => ['handler', 'summary'].includes(user.grievanceAccess);
const isOwner = (grievance, user) =>
  (grievance.employeeId._id || grievance.employeeId).toString() === user._id.toString();

const asString = (value) => (typeof value === 'string' ? value.trim() : '');

async function loadVisibleGrievance(req, res) {
  const { grievanceId } = req.params;
  if (!GRIEVANCE_ID_PATTERN.test(grievanceId)) {
    res.status(404).json({ error: 'Feedback not found' });
    return null;
  }
  const grievance = await Grievance.findOne({ grievanceId })
    .populate('employeeId', 'name email department')
    .populate('statusHistory.changedBy', 'name');
  if (!grievance || !(isOwner(grievance, req.user) || isHandler(req.user))) {
    res.status(404).json({ error: 'Feedback not found' });
    return null;
  }
  return grievance;
}

const getGrievanceMeta = (req, res) => {
  res.json({
    access: req.user.grievanceAccess || null,
    categories: GRIEVANCE_CATEGORIES,
    feedbackTypes: FEEDBACK_TYPES,
    statuses: GRIEVANCE_STATUSES,
    transitions: GRIEVANCE_TRANSITIONS
  });
};

const createGrievance = async (req, res) => {
  const uploaded = [];
  let persisted = false;
  try {
    const category = asString(req.body.category);
    const feedbackType = asString(req.body.feedbackType) || 'concern';
    const subject = asString(req.body.subject);
    const description = asString(req.body.description);
    const incidentDate = asString(req.body.incidentDate);

    const errors = [];
    if (!FEEDBACK_TYPES.includes(feedbackType)) errors.push('Choose a valid feedback type');
    if (!GRIEVANCE_CATEGORIES.includes(category)) errors.push('Choose a valid category');
    if (subject.length < 5 || subject.length > 150) errors.push('Subject must be 5 to 150 characters');
    if (description.length < 20 || description.length > 5000) errors.push('Description must be 20 to 5000 characters');
    if (incidentDate && Number.isNaN(Date.parse(incidentDate))) errors.push('Incident date must be a valid date');
    if (incidentDate && new Date(incidentDate) > new Date()) errors.push('Incident date cannot be in the future');
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors.join('; ') });
    }

    for (const file of req.files || []) {
      const saved = await storageService.save(file);
      uploaded.push({
        fileId: saved.fileId,
        name: saved.name,
        size: saved.size,
        mime: saved.mime,
        storageKey: saved.storageKey,
        privateStorage: true
      });
    }

    const grievance = new Grievance({
      employeeId: req.user._id,
      feedbackType,
      category,
      subject,
      description,
      incidentDate: incidentDate ? new Date(incidentDate) : undefined,
      attachments: uploaded,
      statusHistory: [{ status: 'submitted', changedBy: req.user._id }]
    });
    await grievance.save();
    persisted = true;

    await createAuditLog(req.user._id, 'CREATE_GRIEVANCE', 'GRIEVANCE', {
      grievanceId: grievance.grievanceId,
      category,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    await notifyGrievanceCreated(grievance, req.user).catch(error => console.error("Grievance notification failed:", error.message));

    res.status(201).json({ message: 'Feedback submitted', grievance });
  } catch (error) {
    console.error('Create grievance error:', error);
    // Don't leave files behind for a grievance that was never saved.
    if (!persisted) await Promise.all(uploaded.map((file) => storageService.remove(file.storageKey).catch(() => {})));
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
};

const listGrievances = async (req, res) => {
  try {
    const scope = req.query.scope === 'all' ? 'all' : 'mine';
    if (scope === 'all' && !isHandler(req.user)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const filter = scope === 'mine' ? { employeeId: req.user._id } : {};
    const status = asString(req.query.status);
    const category = asString(req.query.category);
    const feedbackType = asString(req.query.feedbackType);
    if (FEEDBACK_TYPES.includes(feedbackType)) filter.feedbackType = feedbackType;
    if (GRIEVANCE_STATUSES.includes(status)) filter.status = status;
    if (GRIEVANCE_CATEGORIES.includes(category)) filter.category = category;

    const grievances = await Grievance.find(filter)
      .select('-description -statusHistory')
      .populate('employeeId', 'name email department')
      .sort({ createdAt: -1 })
      .limit(500);

    res.json({ grievances });
  } catch (error) {
    console.error('List grievances error:', error);
    res.status(500).json({ error: 'Failed to load feedback' });
  }
};

// Counts only: no names, subjects or descriptions. For handlers and for
// users with summary access (leadership).
const getGrievanceSummary = async (req, res) => {
  try {
    if (!canSeeSummary(req.user)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const [byStatus, byCategory, resolution, open] = await Promise.all([
      Grievance.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Grievance.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Grievance.aggregate([
        { $match: { resolvedAt: { $exists: true } } },
        { $group: { _id: null, avgMs: { $avg: { $subtract: ['$resolvedAt', '$createdAt'] } } } }
      ]),
      Grievance.find({ status: { $in: ['submitted', 'under_review'] } })
        .select('grievanceId category status createdAt')
        .sort({ createdAt: 1 })
    ]);

    const toMap = (rows) => Object.fromEntries(rows.map((row) => [row._id, row.count]));
    const statusCounts = toMap(byStatus);
    const dayMs = 24 * 60 * 60 * 1000;

    res.json({
      total: byStatus.reduce((sum, row) => sum + row.count, 0),
      byStatus: Object.fromEntries(GRIEVANCE_STATUSES.map((s) => [s, statusCounts[s] || 0])),
      byCategory: toMap(byCategory),
      averageResolutionDays: resolution[0] ? Math.round((resolution[0].avgMs / dayMs) * 10) / 10 : null,
      open: open.map((g) => ({
        grievanceId: g.grievanceId,
        category: g.category,
        status: g.status,
        createdAt: g.createdAt,
        ageDays: Math.floor((Date.now() - g.createdAt.getTime()) / dayMs)
      }))
    });
  } catch (error) {
    console.error('Grievance summary error:', error);
    res.status(500).json({ error: 'Failed to load grievance summary' });
  }
};

const getGrievance = async (req, res) => {
  try {
    const grievance = await loadVisibleGrievance(req, res);
    if (!grievance) return;
    res.json({ grievance });
  } catch (error) {
    console.error('Get grievance error:', error);
    res.status(500).json({ error: 'Failed to load feedback' });
  }
};

const updateGrievanceStatus = async (req, res) => {
  try {
    if (!isHandler(req.user)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const grievance = await loadVisibleGrievance(req, res);
    if (!grievance) return;

    if (isOwner(grievance, req.user)) {
      return res.status(403).json({ error: 'Another reviewer must act on feedback you submitted' });
    }

    const status = asString(req.body.status);
    const note = asString(req.body.note);
    if (!(GRIEVANCE_TRANSITIONS[grievance.status] || []).includes(status)) {
      return res.status(400).json({
        error: 'Validation failed',
        details: `Cannot move a ${grievance.status} grievance to ${status || 'that status'}`
      });
    }
    if (['resolved', 'closed'].includes(status) && note.length < 5) {
      return res.status(400).json({ error: 'Validation failed', details: 'Add a note explaining the outcome' });
    }
    if (note.length > 2000) {
      return res.status(400).json({ error: 'Validation failed', details: 'Note must be at most 2000 characters' });
    }

    grievance.status = status;
    grievance.statusHistory.push({ status, note, changedBy: req.user._id });
    if (status === 'resolved') grievance.resolvedAt = new Date();
    if (status === 'under_review') grievance.resolvedAt = undefined;
    await grievance.save();
    await grievance.populate('statusHistory.changedBy', 'name');

    await createAuditLog(req.user._id, 'UPDATE_GRIEVANCE_STATUS', 'GRIEVANCE', {
      grievanceId: grievance.grievanceId,
      status,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    await notifyGrievanceStatusChanged(grievance, grievance.employeeId, note);

    res.json({ message: 'Feedback updated', grievance });
  } catch (error) {
    console.error('Update grievance status error:', error);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
};

// Grievance files are only ever served through this check, never by URL.
const downloadGrievanceAttachment = async (req, res) => {
  try {
    const grievance = await loadVisibleGrievance(req, res);
    if (!grievance) return;

    const attachment = grievance.attachments.find((a) => a.fileId === req.params.fileId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (!attachment.privateStorage) return res.status(503).json({ error: "This attachment requires migration to confidential storage" });
    const file = await storageService.get(attachment.storageKey);
    const safeName = attachment.name.replace(/[^\w. -]/g, '_');
    res.setHeader('Content-Type', attachment.mime || file.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    await pipeline(file.body, res);
  } catch (error) {
    console.error('Grievance attachment download error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
};

export {
  getGrievanceMeta,
  createGrievance,
  listGrievances,
  getGrievanceSummary,
  getGrievance,
  updateGrievanceStatus,
  downloadGrievanceAttachment
};
