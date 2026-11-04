import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();
const { default: Grievance } = await import('../models/Grievance.js');
const { default: publicStorage, privateStorageService: privateStorage } = await import('../services/storage.js');
const apply = process.argv.includes('--apply');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
if (apply) await privateStorage.ensureS3Initialized();
await mongoose.connect(process.env.MONGODB_URI);
try {
  let pending = 0;
  for await (const grievance of Grievance.find().cursor()) {
    for (const attachment of grievance.attachments) {
      if (attachment.privateStorage && !attachment.legacyStorageKey) continue;
      pending++;
      console.log(`${apply ? 'Migrating' : 'Would migrate'} ${grievance.grievanceId} attachment ${attachment.fileId}`);
      if (!apply) continue;
      let legacyKey = attachment.legacyStorageKey;
      if (!attachment.privateStorage) {
        const original = await publicStorage.get(attachment.storageKey);
        const chunks = [];
        for await (const chunk of original.body) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        const saved = await privateStorage.save({ buffer, size: buffer.length, originalname: attachment.name, mimetype: attachment.mime });
        legacyKey = attachment.storageKey;
        const updated = await Grievance.updateOne({ _id: grievance._id, 'attachments.fileId': attachment.fileId }, {
          $set: { 'attachments.$.storageKey': saved.storageKey, 'attachments.$.privateStorage': true, 'attachments.$.legacyStorageKey': legacyKey }
        });
        if (!updated.matchedCount) throw new Error('Attachment changed during migration; original was retained');
      }
      await publicStorage.remove(legacyKey);
      await Grievance.updateOne({ _id: grievance._id, 'attachments.fileId': attachment.fileId }, { $unset: { 'attachments.$.legacyStorageKey': '' } });
    }
  }
  console.log(`${pending} attachment(s) ${apply ? 'migrated' : 'pending; use --apply to migrate and delete the public originals'}`);
} finally { await mongoose.disconnect(); }
