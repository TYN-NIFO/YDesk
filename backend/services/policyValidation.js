import Policy from "../models/Policy.js";
import { validCategories, validBusinessUnits } from "../lib/categoryMaster.js";
import { exchangeRates } from "./exchangeRates.js";

const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;

export const computeClaimTotals = async (claimData, policy) => {
  const items = claimData.lineItems || [];
  const rates = items.some(item => item.currency && item.currency !== 'INR') ? await exchangeRates(policy) : { INR: 1 };
  let grandTotal = 0;
  const totalsByHead = {};
  for (const item of items) {
    if (!money(item.amount) || item.amount <= 0 || !(rates[item.currency || 'INR'] > 0)) {
      throw Object.assign(new Error('Invalid amount or currency'), { status: 400 });
    }
    item.amountInINR = round((item.amount + (item.gstTotal || 0)) * rates[item.currency || 'INR']);
    grandTotal = round(grandTotal + item.amountInINR);
    totalsByHead[item.subCategory] = round((totalsByHead[item.subCategory] || 0) + item.amountInINR);
  }
  let advancesTotal = 0;
  for (const advance of claimData.advances || []) {
    if (!money(advance.amount)) throw Object.assign(new Error('Advances must be non-negative numbers'), { status: 400 });
    advancesTotal = round(advancesTotal + advance.amount);
  }
  return { grandTotal, advancesTotal, netPayable: round(grandTotal - advancesTotal), totalsByHead };
};

export const validateAgainstPolicy = async (data, policy, { checkDocuments = true } = {}) => {
  const violations = [];
  const add = (code, message, level = 'error') => violations.push({ code, message, level });
  const categories = policy.claimCategories?.length ? policy.claimCategories : validCategories;
  if (!categories.includes(data.category)) add('INVALID_CATEGORY', 'Choose an active expense category');
  if (!validBusinessUnits.includes(data.businessUnit)) add('INVALID_BUSINESS_UNIT', 'Choose a valid business unit');
  if (!Array.isArray(data.lineItems) || !data.lineItems.length || data.lineItems.length > 15) {
    add('INVALID_ITEMS', 'Provide between 1 and 15 expense line items');
  } else {
    for (const [index, item] of data.lineItems.entries()) {
      const prefix = `Line ${index + 1}: `;
      if (!money(item.amount) || item.amount <= 0) add('INVALID_AMOUNT', prefix + 'amount must be a positive number');
      if (item.amountInINR !== undefined && (!money(item.amountInINR) || item.amountInINR <= 0)) add('INVALID_INR', prefix + 'INR amount must be positive');
      if (!['INR', 'USD', 'EUR'].includes(item.currency || 'INR')) add('INVALID_CURRENCY', prefix + 'unsupported currency');
      if (!item.date || Number.isNaN(Date.parse(item.date))) add('INVALID_DATE', prefix + 'provide a valid expense date');
      const definition = policy.categoryDefinitions?.find(category => category.name === data.category);
      if (definition && !definition.subCategories.some(subcategory => subcategory.name === item.subCategory)) add('INVALID_SUBCATEGORY', prefix + 'choose a subcategory in this category');
      if (typeof item.subCategory !== 'string' || !item.subCategory.trim()) add('INVALID_SUBCATEGORY', prefix + 'choose a subcategory');
      if (typeof item.description !== 'string' || item.description.trim().length < 10) add('INVALID_DESCRIPTION', prefix + 'description must contain at least 10 characters');
      if (item.gstTotal !== undefined && !money(item.gstTotal)) add('INVALID_GST', prefix + 'GST must be non-negative');
      const sub = String(item.subCategory || '').toLowerCase();
      const type = sub.includes('flight') ? 'flight' : sub.includes('train') ? 'train' : /hotel|lodging/.test(sub) ? 'lodging' : /meal|breakfast|lunch|dinner|snack/.test(sub) ? 'meal' : item.type || 'default';
      if (type === 'flight' && !(item.gstTotal > 0)) add('GST_REQUIRED', prefix + 'GST is required for flights');
      const required = policy.requiredDocuments?.[type] || policy.requiredDocuments?.default || [];
      if (checkDocuments && required.length) {
        const labels = new Set((item.attachments || []).map(file => file.label));
        const missing = required.filter(label => !labels.has(label));
        if (missing.length) add('MISSING_DOCUMENTS', prefix + 'attach: ' + missing.join(', '), policy.rulesBehavior?.missingDocuments === 'soft' ? 'warn' : 'error');
      }
      const cityClass = item.cityClass || data.cityClass || 'A';
      if (!['A', 'B', 'C'].includes(cityClass)) add('INVALID_CITY_CLASS', prefix + 'choose city class A, B or C');
      if (item.nights !== undefined && (!Number.isInteger(item.nights) || item.nights < 1 || item.nights > 365)) add('INVALID_NIGHTS', prefix + 'nights must be between 1 and 365');
      const mealType = item.mealType || ['breakfast', 'lunch', 'dinner', 'snack'].find(meal => sub.includes(meal)) || 'lunch';
      const cap = type === 'lodging' ? policy.lodgingCaps?.[cityClass] * (item.nights || 1) : type === 'meal' && mealType ? policy.mealCaps?.[cityClass]?.[mealType] : null;
      if (cap && item.amountInINR > cap) add('CAP_EXCEEDED', prefix + `amount exceeds the INR ${cap} policy cap`, policy.rulesBehavior?.capExceeded === 'hard' ? 'error' : 'warn');
    }
  }
  if (data.advances !== undefined && !Array.isArray(data.advances)) add('INVALID_ADVANCES', 'Advances must be a list');
  else for (const advance of data.advances || []) if (!money(advance.amount)) add('INVALID_ADVANCE', 'Advances must be non-negative numbers');
  return { isValid: !violations.some(item => item.level === 'error'), violations };
};

export const createDefaultPolicy = async () => Policy.create({
  claimCategories: validCategories,
  payoutChannels: ['Bank Transfer', 'Cash', 'Check']
});

export const getCurrentPolicy = async () => {
  return await Policy.findOne().sort({ createdAt: -1 }) || await createDefaultPolicy();
};

export const validateFileUpload = (file, policy) => {
  const violations = [];

  try {
    // Check file type
    const fileExtension = file.originalname.split(".").pop().toLowerCase();
    if (!policy.allowedFileTypes.includes(fileExtension)) {
      violations.push({
        code: "INVALID_FILE_TYPE",
        message: `File type not allowed. Allowed types: ${policy.allowedFileTypes.join(
          ", "
        )}`,
        level: "error",
      });
    }

    // Check file size
    const maxSizeBytes = (policy.maxFileSizeMB || 10) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      violations.push({
        code: "FILE_TOO_LARGE",
        message: `File size exceeds limit of ${policy.maxFileSizeMB || 10}MB`,
        level: "error",
      });
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  } catch (error) {
    console.error("File validation error:", error);
    violations.push({
      code: "VALIDATION_ERROR",
      message: "Error during file validation",
      level: "error",
    });

    return {
      isValid: false,
      violations,
    };
  }
};
