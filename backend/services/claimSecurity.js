const editableFields = ['businessUnit', 'category', 'lineItems', 'advances'];
const protectedFields = ['employeeId', 'createdBy', 'claimId', 'financeApproval', 'supervisorApproval', 'payment', 'attachments', 'policyVersion', 'violations'];

export function prepareClaimUpdate(input, claim) {
  if (protectedFields.some(field => Object.hasOwn(input, field))) {
    throw Object.assign(new Error('Ownership, approval and payment fields cannot be edited'), { status: 400 });
  }
  if (['paid', 'done'].includes(claim.status)) {
    throw Object.assign(new Error('Settled claims cannot be edited'), { status: 403 });
  }
  if (input.status && !(claim.status === 'rejected' && input.status === 'submitted')) {
    throw Object.assign(new Error('Use the approval or payment action to change claim status'), { status: 400 });
  }
  const update = Object.fromEntries(editableFields.filter(field => Object.hasOwn(input, field)).map(field => [field, input[field]]));
  if (!Object.keys(update).length) throw Object.assign(new Error('No editable fields provided'), { status: 400 });
  const existingAttachments = new Map((claim.lineItems || []).flatMap(item => item.attachments || []).map(file => [file.fileId, file]));
  if (Array.isArray(update.lineItems)) {
    update.lineItems = update.lineItems.map(item => ({
      ...item,
      attachments: (item.attachments || []).map(file => {
        const existing = existingAttachments.get(file.fileId);
        if (!existing) throw Object.assign(new Error('Unknown attachment reference'), { status: 400 });
        return existing.toObject ? existing.toObject() : existing;
      })
    }));
  }
  if (input.status === 'submitted' || ['approved', 'finance_approved'].includes(claim.status)) {
    update.status = 'submitted';
    update.financeApproval = { status: 'pending' };
    update.supervisorApproval = { status: 'pending' };
  }
  return update;
}

export function assertCanAttach(user, claim) {
  const isOwner = claim.employeeId.toString() === user._id.toString();
  const canManage = ['admin', 'finance_manager', 'executive'].includes(user.role);
  if ((!isOwner && !canManage) || !['submitted', 'rejected'].includes(claim.status)) {
    throw Object.assign(new Error('Attachments can only be changed on accessible, unapproved claims'), { status: 403 });
  }
}

export function fileAssignment(mapping, file, count) {
  const entry = mapping[file.originalname] ?? 0;
  const index = typeof entry === 'object' ? entry.lineItemIndex : entry;
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw Object.assign(new Error('Invalid receipt line item'), { status: 400 });
  }
  const label = typeof entry === 'object' && typeof entry.label === 'string' ? entry.label : 'supporting_doc';
  return { index, label };
}
