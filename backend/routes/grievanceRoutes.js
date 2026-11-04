import express from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import {
  getGrievanceMeta,
  createGrievance,
  listGrievances,
  getGrievanceSummary,
  getGrievance,
  updateGrievanceStatus,
  downloadGrievanceAttachment
} from '../controllers/grievanceController.js';

const MAX_FILES = 3;
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG and PNG files are allowed'), false);
    }
  }
});

// Turns multer errors (too large, too many, wrong type) into a 400.
const uploadAttachments = (req, res, next) => {
  upload.array('files', MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    const details = err.code === 'LIMIT_FILE_SIZE'
      ? 'Each file must be 4MB or smaller'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
        ? `Attach at most ${MAX_FILES} files`
        : err.message;
    res.status(400).json({ error: 'Validation failed', details });
  });
};

const router = express.Router();

router.use(auth);

// GET /api/grievances/meta - Categories, statuses and the caller's grievance access
router.get('/meta', getGrievanceMeta);

// GET /api/grievances/summary - Aggregate counts (handlers and summary access)
router.get('/summary', getGrievanceSummary);

// GET /api/grievances?scope=mine|all - Own grievances, or all for handlers
router.get('/', listGrievances);

// POST /api/grievances - Raise a grievance (multipart, up to 3 files)
router.post('/', uploadAttachments, createGrievance);

// GET /api/grievances/:grievanceId - Owner, handler, or summary access
router.get('/:grievanceId', getGrievance);

// PATCH /api/grievances/:grievanceId/status - Handlers only
router.patch('/:grievanceId/status', updateGrievanceStatus);

// GET /api/grievances/:grievanceId/attachments/:fileId - Owner, handler, or summary access
router.get('/:grievanceId/attachments/:fileId', downloadGrievanceAttachment);

export default router;
