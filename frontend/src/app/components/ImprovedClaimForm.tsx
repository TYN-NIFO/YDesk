"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateClaimMutation,
  useUpdateClaimMutation,
  useGetPolicyQuery,
  useUploadClaimFileMutation,
} from "../../lib/api";
import {
  categoryMaster as defaultCategories,
  businessUnits,
  Category,
} from "../../lib/categoryMaster";
import { convertToINR, formatCurrency } from "../../lib/currencyConverter";
import toast from "react-hot-toast";
import { X, Upload, FileText, Plus, ArrowLeft, Building2, Receipt, Wallet, Loader2 } from "lucide-react";
import { PageHeading, FormSection, Field } from "./ui/WorkspaceUI";

// Type for existing file objects
interface ExistingFile extends File {
  isExisting: boolean;
  fileId: string;
  storageKey: string;
}

// Currency options
const currencies = ["INR", "USD", "EUR"] as const;

// Simplified schema
const createClaimSchema = () => {
  const baseSchema = z.object({
    businessUnit: z.enum(businessUnits as [string, ...string[]]),
    category: z.string().min(1, "Category is required"),
    advances: z
      .array(
        z.object({
          date: z.string().min(1, "Date is required"),
          refNo: z.string().optional(),
          amount: z.number().positive("Amount must be positive"),
        })
      )
      .default([]),
    lineItems: z
      .array(
        z.object({
          date: z.string().min(1, "Date is required"),
          subCategory: z.string().min(1, "Sub-category is required"),
          description: z.string().min(10, "Describe the expense in at least 10 characters"),
          cityClass: z.enum(["A", "B", "C"]).default("A"),
          mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("lunch"),
          nights: z.coerce.number().int().min(1).max(365).default(1),
          currency: z.enum(currencies),
          amount: z.union([z.string(), z.number()]).refine((val) => Number.isFinite(Number(val)) && Number(val) > 0, "Enter an amount greater than zero"),
          gstTotal: z.union([z.string(), z.number()]).refine((val) => Number.isFinite(Number(val)) && Number(val) >= 0, "Tax cannot be negative"),
          amountInINR: z.union([z.string(), z.number()]).refine((val) => Number.isFinite(Number(val)) && Number(val) > 0, "Enter a valid expense amount"),
          attachments: z
            .array(
              z.object({
                fileId: z.string(),
                name: z.string(),
                size: z.number(),
                mime: z.string(),
                storageKey: z.string(),
                label: z.string(),
              })
            )
            .default([]),
        })
      )
      .min(1, "At least one line item is required")
      .max(15, "Maximum 15 line items allowed"),
  });

  return baseSchema;
};

type ClaimFormData = z.infer<ReturnType<typeof createClaimSchema>>;

interface ImprovedClaimFormProps {
  onClose: () => void;
  employeeId?: string;
  existingClaim?: any;
  isEditing?: boolean;
}

export default function ImprovedClaimForm({
  onClose,
  employeeId,
  existingClaim,
  isEditing = false,
}: ImprovedClaimFormProps) {
  const [selectedCategory, setSelectedCategory] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ [key: number]: File[] }>(
    {}
  );
  const [fileLabels, setFileLabels] = useState<{ [key: number]: string[] }>({});

  const [createClaim, { isLoading: isCreatingClaim }] =
    useCreateClaimMutation();
  const [updateClaim, { isLoading: isUpdatingClaim }] =
    useUpdateClaimMutation();
  const [uploadClaimFile, { isLoading: isUploadingFiles }] =
    useUploadClaimFileMutation();
  const { data: policy, isLoading: policyLoading } = useGetPolicyQuery({});

  const categoryMaster: Category[] = policy?.categoryDefinitions || defaultCategories;
  const receiptLabels: string[] = Array.from(new Set(["supporting_doc", ...Object.values(policy?.requiredDocuments || {}).flat() as string[]]));
  const schema = createClaimSchema();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<ClaimFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      businessUnit: "Coinnovation",
      category: "",
      advances: [],
      lineItems: [],
    },
  });

  const {
    fields: advanceFields,
    append: appendAdvance,
    remove: removeAdvance,
  } = useFieldArray({
    control,
    name: "advances",
  });

  const {
    fields: lineItemFields,
    append: appendLineItem,
    remove: removeLineItem,
  } = useFieldArray({
    control,
    name: "lineItems",
  });

  // Initialize form with existing claim data when editing
  useEffect(() => {
    if (isEditing && existingClaim) {
      const claimData = {
        businessUnit: existingClaim.businessUnit || "Coinnovation",
        category: existingClaim.category || "",
        advances: existingClaim.advances || [],
        lineItems:
          existingClaim.lineItems?.map((item: any) => ({
            date: item.date
              ? new Date(item.date).toISOString().split("T")[0]
              : "",
            cityClass: item.cityClass || "A",
            mealType: item.mealType || "lunch",
            nights: item.nights || 1,
            subCategory: item.subCategory || "",
            description: item.description || "",
            currency: item.currency || "INR",
            amount: item.amount || 0,
            gstTotal: item.gstTotal || 0,
            amountInINR: item.amountInINR || 0,
            attachments: item.attachments || [],
          })) || [],
      };

      reset(claimData);
      setSelectedCategory(existingClaim.category || "");

      // Load existing files into the form state
      const existingFiles: { [key: number]: File[] } = {};
      const existingLabels: { [key: number]: string[] } = {};

      existingClaim.lineItems?.forEach((item: any, index: number) => {
        if (item.attachments && item.attachments.length > 0) {
          // Create mock File objects for existing attachments (for display purposes)
          const mockFiles = item.attachments.map((attachment: any) => {
            // Create a custom object that mimics a File but allows property modification
            const mockFile = {
              name: attachment.name,
              type: attachment.mime || "application/octet-stream",
              size: attachment.size || 0,
              lastModified: Date.now(),
              webkitRelativePath: "",
              // Custom properties to track this is an existing file
              isExisting: true,
              fileId: attachment.fileId,
              storageKey: attachment.storageKey,
              // Add File-like methods if needed
              arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
              slice: () => new Blob(),
              stream: () => new ReadableStream(),
              text: () => Promise.resolve(""),
            } as ExistingFile;

            return mockFile;
          });

          existingFiles[index] = mockFiles;
          existingLabels[index] = item.attachments.map((file: any) => file.label || "supporting_doc");
        }
      });

      setUploadedFiles(existingFiles);
      setFileLabels(existingLabels);
    }
  }, [isEditing, existingClaim, reset]);

  // Handle category change
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setValue("category", category);
  };

  // Add line item
  const addLineItem = () => {
    if (lineItemFields.length >= 15) {
      toast.error("Maximum 15 line items allowed");
      return;
    }

    const newLineItem = {
      cityClass: 'A' as const,
      mealType: 'lunch' as const,
      nights: 1,
      date: new Date().toISOString().slice(0, 10), // Default to current date
      subCategory: "",
      description: "",
      currency: "INR" as const,
      amount: "",
      gstTotal: "",
      amountInINR: "",
      attachments: [],
    };

    appendLineItem(newLineItem);
  };

  // Handle file upload - multiple files per line item (up to 3 files)
  const handleFileUpload = (
    files: FileList | null,
    lineItemIndex: number,
    event?: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!files) {
      return;
    }

    const existingFiles = uploadedFiles[lineItemIndex] || [];
    const filesToAdd = Array.from(files);

    // Check if adding these files would exceed the 3-file limit
    if (existingFiles.length + filesToAdd.length > 3) {
      toast.error(
        `Maximum 3 files allowed per line item. You currently have ${existingFiles.length} file(s) and are trying to add ${filesToAdd.length} more.`
      );
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];
    const maxSize = 4 * 1024 * 1024;

    for (const file of filesToAdd) {
      // Validate file type
      if (!allowedTypes.includes(file.type)) {
        toast.error(
          `File "${file.name}" is not allowed. Only PDF, JPG, JPEG, and PNG files are accepted.`
        );
        continue;
      }

      // Validate file size
      if (file.size > maxSize) {
        toast.error(
          `File "${file.name}" is too large (${(
            file.size /
            1024 /
            1024
          ).toFixed(2)}MB). Maximum size is 4MB.`
        );
        continue;
      }

      // Additional validation for very small files
      if (file.size < 1024) {
        toast.error(
          `File "${file.name}" appears to be too small or corrupted. Please select a valid file.`
        );
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      return;
    }

    // Add valid files to existing files
    const newFiles = [...existingFiles, ...validFiles];
    const newLabels = [
      ...(fileLabels[lineItemIndex] || []),
      ...validFiles.map(() => "supporting_doc"),
    ];

    setUploadedFiles((prev) => ({
      ...prev,
      [lineItemIndex]: newFiles,
    }));
    setFileLabels((prev) => ({
      ...prev,
      [lineItemIndex]: newLabels,
    }));

    const message =
      validFiles.length === 1
        ? `✅ File added to line item ${lineItemIndex + 1}: "${validFiles[0].name
        }" (${(validFiles[0].size / 1024 / 1024).toFixed(2)}MB)`
        : `✅ ${validFiles.length} files added to line item ${lineItemIndex + 1
        }`;

    toast.success(message);
  };

  // Remove file from line item
  const removeFile = (lineItemIndex: number, fileIndex: number) => {
    const remainingAttachments = (watch(`lineItems.${lineItemIndex}.attachments`) || []).filter((attachment: any) => attachment.fileId !== (uploadedFiles[lineItemIndex]?.[fileIndex] as ExistingFile)?.fileId);
    setValue(`lineItems.${lineItemIndex}.attachments`, remainingAttachments);
    setUploadedFiles((prev) => {
      const newFiles = { ...prev };
      if (newFiles[lineItemIndex]) {
        newFiles[lineItemIndex] = newFiles[lineItemIndex].filter(
          (_, index) => index !== fileIndex
        );
        if (newFiles[lineItemIndex].length === 0) {
          delete newFiles[lineItemIndex];
        }
      }
      return newFiles;
    });

    setFileLabels((prev) => {
      const newLabels = { ...prev };
      if (newLabels[lineItemIndex]) {
        newLabels[lineItemIndex] = newLabels[lineItemIndex].filter(
          (_, index) => index !== fileIndex
        );
        if (newLabels[lineItemIndex].length === 0) {
          delete newLabels[lineItemIndex];
        }
      }
      return newLabels;
    });

    // Reset the file input to allow re-uploading the same file
    const fileInput = document.getElementById(
      `file-upload-${lineItemIndex}`
    ) as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  // Calculate totals
  const calculateTotals = () => {
    const lineItems = watch("lineItems");
    const advances = watch("advances");

    const grandTotal = lineItems.reduce(
      (sum: number, item: any) => sum + (item.amountInINR || 0),
      0
    );
    const advancesTotal = advances.reduce(
      (sum: number, advance: any) => sum + (advance.amount || 0),
      0
    );
    const netPayable = grandTotal - advancesTotal;

    return { grandTotal, advancesTotal, netPayable };
  };

  const totals = calculateTotals();

  const onSubmit = async (data: ClaimFormData) => {
    try {
      if (!employeeId) {
        toast.error("Employee ID is required");
        console.error("Employee ID missing:", { employeeId });
        return;
      }

      console.log("Form data validation passed:", data);
      console.log("Employee ID:", employeeId);
      console.log("Uploaded files:", uploadedFiles);

      // Prepare files array and mapping
      const allFiles: File[] = [];
      const fileMapping: { [fileName: string]: { lineItemIndex: number; label: string } } = {};

      Object.entries(uploadedFiles).forEach(([lineItemIndex, files]) => {
        files.forEach((file, fileIndex) => {
          fileMapping[file.name] = { lineItemIndex: Number(lineItemIndex), label: fileLabels[Number(lineItemIndex)]?.[fileIndex] || "supporting_doc" };
          // Add all files (existing and new) - the API will filter out existing ones
          allFiles.push(file as File);
        });
      });

      // Validate total file size for Vercel compatibility (only count new files)
      const newFiles = allFiles.filter(
        (file) => !(file as ExistingFile).isExisting
      );
      const totalFileSize = newFiles.reduce(
        (total, file) => total + file.size,
        0
      );
      const maxTotalSize = 4 * 1024 * 1024; // 4MB total limit
      if (totalFileSize > maxTotalSize) {
        toast.error(
          `Total file size (${(totalFileSize / 1024 / 1024).toFixed(
            2
          )}MB) is too large. Keep new receipts under 4MB in total.`
        );
        return;
      }

      // Convert string dates to Date objects for backend
      const processedData = {
        ...data,
        lineItems: data.lineItems.map((item) => ({
          ...item,
          date: new Date(item.date),
          amount: Number(item.amount),
          gstTotal: Number(item.gstTotal || 0),
          amountInINR: Number(item.amountInINR),
        })),
        advances: data.advances.map((advance) => ({
          ...advance,
          date: new Date(advance.date),
        })),
      };

      const claimData = {
        ...processedData,
        grandTotal: totals.grandTotal,
        netPayable: totals.netPayable,
        totalsByHead: {}, // Calculate based on line item types
      };

      let result;
      if (isEditing && existingClaim) {
        // For editing, send files with the claim update
        result = await updateClaim({
          id: existingClaim._id,
          claimData,
          files: allFiles,
          fileMapping,
        }).unwrap();
      } else {
        // For new claims, send files with the claim creation
        result = await createClaim({
          claimData,
          files: allFiles,
          fileMapping,
        }).unwrap();
      }

      const newFileCount = newFiles.length;
      const existingFileCount = allFiles.length - newFileCount;
      const successMessage = isEditing
        ? `Claim updated successfully!${newFileCount > 0 ? ` ${newFileCount} file(s) replaced.` : ""
        }${existingFileCount > 0 && newFileCount === 0
          ? ` ${existingFileCount} existing file(s) preserved.`
          : ""
        }`
        : `Claim submitted successfully!${newFileCount > 0 ? ` ${newFileCount} file(s) attached.` : ""
        }`;

      toast.success(successMessage);

      if (!isEditing) {
        reset();
        setUploadedFiles({});
        setFileLabels({});
      }
      onClose();
    } catch (error: any) {
      console.error("Claim submission error:", error);

      if (error?.data?.violations && Array.isArray(error.data.violations) && error.data.violations.length > 0) {
        // Show specific policy violations instead of generic top-level error
        toast.error(`Please fix the following issues: ${error.data.violations.map((v: any) => v.message).join(' | ')}`);
        return;
      }

      let errorMessage = "Failed to submit claim";

      if (error?.data?.error) {
        errorMessage = error.data.error;
      } else if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      toast.error(errorMessage);
    }
  };

  const busy = isCreatingClaim || isUpdatingClaim || isUploadingFiles;
  const removeExpense = (index: number) => {
    removeLineItem(index);
    setUploadedFiles(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => Number(key) !== index).map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value])));
    setFileLabels(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => Number(key) !== index).map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value])));
  };

  return (
    <div className="space-y-6">
      <PageHeading title={isEditing ? "Edit expense claim" : "New expense claim"} description="Add your expenses and receipts. We’ll take care of the approval trail." icon={Receipt} onBack={onClose} />
      <form onSubmit={handleSubmit(onSubmit)} className="ui-form-layout">
        <div className="ui-form-main">
          <FormSection title="Claim details" description="Choose where these expenses belong." icon={Building2}>
            <div className="grid sm:grid-cols-2 gap-5">
              <Field label="Business unit" htmlFor="claim-business-unit" required error={errors.businessUnit?.message}>
                <Controller name="businessUnit" control={control} render={({ field }) => <select {...field} id="claim-business-unit" className="ui-control">{businessUnits.map(unit => <option key={unit}>{unit}</option>)}</select>} />
              </Field>
              <Field label="Expense category" htmlFor="claim-category" required error={errors.category?.message}>
                <Controller name="category" control={control} render={({ field }) => <select {...field} id="claim-category" className="ui-control" value={selectedCategory} onChange={event => handleCategoryChange(event.target.value)}><option value="">Choose a category</option>{categoryMaster.map(category => <option key={category.name}>{category.name}</option>)}</select>} />
              </Field>
            </div>
          </FormSection>
          <FormSection title="Expense items" description="Keep each expense and its supporting receipts together." icon={Receipt} actions={<button type="button" className="ui-button ui-button-secondary" onClick={addLineItem} disabled={lineItemFields.length >= 15 || busy}><Plus size={15} />Add expense</button>}>
            {lineItemFields.length === 0 ? <div className="ui-empty"><span className="ui-empty-icon"><Receipt size={23} /></span><h3>Start with your first expense</h3><p>Add a date, amount, and receipt for each item you’re claiming.</p><button type="button" className="ui-button ui-button-primary mt-5" onClick={addLineItem}><Plus size={15} />Add an expense</button></div> : <div className="space-y-5">{lineItemFields.map((field, index) => <LineItemForm key={field.id} index={index} control={control} errors={errors} lineItem={field} onRemove={() => removeExpense(index)} watch={watch} setValue={setValue} selectedCategory={selectedCategory} handleFileUpload={handleFileUpload} removeFile={removeFile} categories={categoryMaster} receiptLabels={receiptLabels} labels={fileLabels[index] || []} onLabelChange={(fileIndex, label) => setFileLabels(previous => ({ ...previous, [index]: (previous[index] || []).map((current, position) => position === fileIndex ? label : current) }))} uploadedFiles={uploadedFiles[index] || []} />)}</div>}
          </FormSection>
          <FormSection title="Advances received" description="Already received money for this expense? Add it here to reconcile the balance." icon={Wallet} actions={<button type="button" className="ui-button ui-button-secondary" onClick={() => appendAdvance({ date: new Date().toISOString().slice(0, 10), amount: 0 })}><Plus size={15} />Add advance</button>}>
            {advanceFields.length ? <div className="space-y-4">{advanceFields.map((field, index) => <AdvanceForm key={field.id} index={index} control={control} errors={errors} onRemove={() => removeAdvance(index)} />)}</div> : <p className="ui-field-hint">No advances added. The full expense total will be payable.</p>}
          </FormSection>
          {Object.keys(errors).length > 0 && <div role="alert" className="ui-note">Check the highlighted fields before submitting. Each expense needs a date, a description of at least 10 characters, and a valid amount.</div>}
          {!employeeId && <p role="alert" className="ui-field-error">Your session could not be loaded. Sign in again to continue.</p>}
          <div className="ui-form-actions"><button type="button" onClick={onClose} disabled={busy} className="ui-button ui-button-secondary">Cancel</button><button type="submit" disabled={busy || !lineItemFields.length || !employeeId} className="ui-button ui-button-primary">{busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}{busy ? "Saving claim…" : isEditing ? "Save claim changes" : "Submit for approval"}</button></div>
        </div>
        <aside className="ui-summary" aria-label="Claim summary">
          <h2 className="ui-summary-heading">Your claim at a glance</h2>
          <div className="ui-summary-content"><div className="ui-summary-row"><span>Expense items</span><strong>{lineItemFields.length}</strong></div><div className="ui-summary-row"><span>Expense total</span><strong>{formatCurrency(totals.grandTotal, "INR")}</strong></div><div className="ui-summary-row"><span>Less advances</span><strong>{formatCurrency(totals.advancesTotal, "INR")}</strong></div></div>
          <div className="ui-summary-total"><p>{totals.netPayable < 0 ? "Advance to reconcile" : "Estimated reimbursement"}</p><strong aria-live="polite">{formatCurrency(Math.abs(totals.netPayable), "INR")}</strong><small>Final amounts are calculated when your claim is submitted.</small></div>
          <div className="ui-summary-help"><h3>A smooth approval starts here</h3><p>Attach clear PDF, JPG, or PNG receipts. Each file can be up to 4MB, with 3 files per expense.</p><p className="mt-3">Choose the receipt labels required by your company policy. Keep all new files under the 4MB submission limit.</p></div>
        </aside>
      </form>
    </div>
  );
}

// Line Item Form Component
interface LineItemFormProps {
  index: number;
  control: any;
  errors: any;
  lineItem: any;
  onRemove: () => void;
  watch: any;
  setValue: any;
  selectedCategory: string;
  handleFileUpload: (
    files: FileList | null,
    lineItemIndex: number,
    event?: React.ChangeEvent<HTMLInputElement>
  ) => void;
  removeFile: (lineItemIndex: number, fileIndex: number) => void;
  categories: Category[];
  receiptLabels: string[];
  labels: string[];
  onLabelChange: (index: number, label: string) => void;
  uploadedFiles: File[];
}

function LineItemForm({
  index,
  control,
  errors,
  lineItem,
  onRemove,
  watch,
  setValue,
  selectedCategory,
  handleFileUpload,
  removeFile,
  uploadedFiles,
  categories,
  receiptLabels,
  labels,
  onLabelChange,
}: LineItemFormProps) {
  const watchedCurrency = watch(`lineItems.${index}.currency`);
  const watchedAmount = watch(`lineItems.${index}.amount`);
  const watchedGstTotal = watch(`lineItems.${index}.gstTotal`);

  // Calculate total for this line item (ensure proper number conversion)
  const lineItemTotal =
    (Number(watchedAmount) || 0) + (Number(watchedGstTotal) || 0);

  // Update amount in INR when currency or amount changes
  useEffect(() => {
    let active = true;
    const updateAmountInINR = async () => {
      if (!(lineItemTotal > 0) || !watchedCurrency) {
        setValue(`lineItems.${index}.amountInINR`, 0);
        return;
      }
      try {
        const result = await convertToINR(lineItemTotal, watchedCurrency);
        if (active) setValue(`lineItems.${index}.amountInINR`, result.inr);
      } catch {
        if (active) {
          setValue(`lineItems.${index}.amountInINR`, 0);
          toast.error("Exchange rates are unavailable. Retry or select INR.");
        }
      }
    };
    updateAmountInINR();
    return () => { active = false; };
  }, [lineItemTotal, watchedCurrency, index, setValue]);

  const errorFor = (name: string) => errors.lineItems?.[index]?.[name]?.message;
  const prefix = `expense-${index}`;
  const subcategory = watch(`lineItems.${index}.subCategory`) || '';
  const requiredLabels = receiptLabels.filter(label => label !== 'supporting_doc');

  return <div className="ui-expense-item">
    <div className="ui-expense-item-heading"><h3><span className="ui-item-number">{index + 1}</span>{subcategory || "Expense item"}</h3><button type="button" className="ui-icon-button" onClick={onRemove} aria-label={`Remove expense ${index + 1}`}><X size={17} /></button></div>
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Expense date" htmlFor={`${prefix}-date`} required error={errorFor('date')}><Controller name={`lineItems.${index}.date`} control={control} render={({ field }) => <input {...field} id={`${prefix}-date`} type="date" className="ui-control" aria-invalid={!!errorFor('date')} />} /></Field>
      <Field label="Subcategory" htmlFor={`${prefix}-subcategory`} required error={errorFor('subCategory')}><Controller name={`lineItems.${index}.subCategory`} control={control} render={({ field }) => <select {...field} id={`${prefix}-subcategory`} className="ui-control" aria-invalid={!!errorFor('subCategory')}><option value="">Choose a subcategory</option>{(categories.find(category => category.name === selectedCategory)?.subCategories || []).map(sub => <option key={sub.name}>{sub.name}</option>)}</select>} /></Field>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
      <Field label="Currency" htmlFor={`${prefix}-currency`}><Controller name={`lineItems.${index}.currency`} control={control} render={({ field }) => <select {...field} id={`${prefix}-currency`} className="ui-control">{currencies.map(currency => <option key={currency}>{currency}</option>)}</select>} /></Field>
      <Field label="Amount before tax" htmlFor={`${prefix}-amount`} required error={errorFor('amount')}><Controller name={`lineItems.${index}.amount`} control={control} render={({ field }) => <input {...field} id={`${prefix}-amount`} type="number" min="0.01" step="0.01" placeholder="0.00" className="ui-control" aria-invalid={!!errorFor('amount')} />} /></Field>
      <Field label="GST / tax" htmlFor={`${prefix}-gst`} hint={/flight/i.test(subcategory) ? "Required for flight expenses." : "Enter 0 when no tax applies."} error={errorFor('gstTotal')}><Controller name={`lineItems.${index}.gstTotal`} control={control} render={({ field }) => <input {...field} id={`${prefix}-gst`} type="number" min="0" step="0.01" placeholder="0.00" className="ui-control" />} /></Field>
      <Field label="City class" htmlFor={`${prefix}-city`}><Controller name={`lineItems.${index}.cityClass`} control={control} render={({ field }) => <select {...field} id={`${prefix}-city`} className="ui-control">{['A', 'B', 'C'].map(city => <option key={city}>{city}</option>)}</select>} /></Field>
      {/meal|breakfast|lunch|dinner|snack/i.test(subcategory) && <Field label="Meal" htmlFor={`${prefix}-meal`}><Controller name={`lineItems.${index}.mealType`} control={control} render={({ field }) => <select {...field} id={`${prefix}-meal`} className="ui-control capitalize">{['breakfast', 'lunch', 'dinner', 'snack'].map(meal => <option key={meal}>{meal}</option>)}</select>} /></Field>}
      {/hotel|lodging/i.test(subcategory) && <Field label="Number of nights" htmlFor={`${prefix}-nights`} error={errorFor('nights')}><Controller name={`lineItems.${index}.nights`} control={control} render={({ field }) => <input {...field} id={`${prefix}-nights`} className="ui-control" type="number" min="1" max="365" onChange={event => field.onChange(Number(event.target.value))} />} /></Field>}
    </div>
    <div className="mt-4"><Field label="Business purpose" htmlFor={`${prefix}-description`} required error={errorFor('description')} hint="Explain what the expense was for in at least 10 characters."><Controller name={`lineItems.${index}.description`} control={control} render={({ field }) => <textarea {...field} id={`${prefix}-description`} className="ui-control" rows={2} placeholder="For example, travel to the client workshop in Coimbatore" aria-invalid={!!errorFor('description')} />} /></Field></div>
    <div className="mt-5 space-y-3"><p className="ui-label">Supporting receipts</p><label className="ui-upload" htmlFor={`file-upload-${index}`}><Upload size={20} /><span>{uploadedFiles.length >= 3 ? "3 receipts attached" : "Choose receipt files"}</span><small>PDF, JPG, PNG · up to 4MB each · 3 per expense</small><input type="file" className="sr-only" id={`file-upload-${index}`} accept=".pdf,.jpg,.jpeg,.png" multiple disabled={uploadedFiles.length >= 3} onChange={event => { handleFileUpload(event.target.files, index, event); event.target.value = ''; }} /></label>
      {uploadedFiles.map((file, fileIndex) => <div key={`${file.name}-${fileIndex}`} className="ui-receipt"><div className="ui-receipt-name"><FileText size={16} /><span>{file.name}<small className="block text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB{(file as ExistingFile).isExisting ? " · Saved receipt" : ""}</small></span></div>{!(file as ExistingFile).isExisting && <select className="ui-control max-w-[180px]" aria-label={`Receipt label for ${file.name}`} value={labels[fileIndex] || "supporting_doc"} onChange={event => onLabelChange(fileIndex, event.target.value)}>{receiptLabels.map(label => <option key={label} value={label}>{label.replaceAll('_', ' ')}</option>)}</select>}<button type="button" className="ui-icon-button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(index, fileIndex)}><X size={15} /></button></div>)}
      {requiredLabels.length > 0 && <p className="ui-field-hint">Your policy may require specific receipt labels. Select the label matching each document.</p>}
    </div>
    <div className="ui-expense-item-total"><span>Item total, including tax</span><strong>{formatCurrency(Number(watch(`lineItems.${index}.amountInINR`)) || 0, "INR")}</strong></div>
  </div>;
}

// Advance Form Component
interface AdvanceFormProps {
  index: number;
  control: any;
  errors: any;
  onRemove: () => void;
}

function AdvanceForm({ index, control, errors, onRemove }: AdvanceFormProps) {
  return <div className="ui-expense-item"><div className="ui-expense-item-heading"><h3><span className="ui-item-number">{index + 1}</span>Advance received</h3><button type="button" className="ui-icon-button" onClick={onRemove} aria-label={`Remove advance ${index + 1}`}><X size={16} /></button></div><div className="grid sm:grid-cols-3 gap-4">
    <Field label="Date received" htmlFor={`advance-${index}-date`} error={errors.advances?.[index]?.date?.message}><Controller name={`advances.${index}.date`} control={control} render={({ field }) => <input {...field} id={`advance-${index}-date`} type="date" className="ui-control" />} /></Field>
    <Field label="Reference" htmlFor={`advance-${index}-reference`} hint="Optional transaction reference."><Controller name={`advances.${index}.refNo`} control={control} render={({ field }) => <input {...field} value={field.value || ''} id={`advance-${index}-reference`} placeholder="Reference number" className="ui-control" />} /></Field>
    <Field label="Amount (INR)" htmlFor={`advance-${index}-amount`} error={errors.advances?.[index]?.amount?.message}><Controller name={`advances.${index}.amount`} control={control} render={({ field }) => <input {...field} id={`advance-${index}-amount`} type="number" min="0.01" step="0.01" onChange={event => field.onChange(Number(event.target.value))} className="ui-control" />} /></Field>
  </div></div>;
}
