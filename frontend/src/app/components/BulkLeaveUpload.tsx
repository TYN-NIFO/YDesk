'use client';

import { Dialog } from "./ui/WorkspaceUI";

import { useState } from 'react';
import { useCreateLeaveMutation, useCreateBulkLeavesMutation } from '@/lib/api';
import toast from 'react-hot-toast';

interface BulkLeaveUploadProps {
  onUploadComplete: () => void;
}

interface LeaveRecord {
  employeeEmail: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  reason: string;
  hours?: number;
}

export default function BulkLeaveUpload({ onUploadComplete }: BulkLeaveUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<'csv' | 'manual'>('csv');
  const [csvData, setCsvData] = useState<string>('');
  const [manualRecords, setManualRecords] = useState<LeaveRecord[]>([
    {
      employeeEmail: '',
      startDate: '',
      endDate: '',
      leaveType: 'Planned Leave',
      reason: '',
      hours: 8
    }
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const [createLeave] = useCreateLeaveMutation();
  const [createBulkLeaves] = useCreateBulkLeavesMutation();

  const leaveTypes = [
    'Business Trip',
    'WFH',
    'Planned Leave',
    'Unplanned Leave',
    'OD',
    'Permission',
    'Flexi'
  ];

  const validateRecord = (record: LeaveRecord): string[] => {
    const errors: string[] = [];

    if (!record.employeeEmail) errors.push('Employee email is required');
    if (!record.startDate) errors.push('Start date is required');
    if (!record.endDate) errors.push('End date is required');
    if (!record.leaveType) errors.push('Leave type is required');
    if (!record.reason) errors.push('Reason is required');

    if (record.startDate && record.endDate) {
      const start = new Date(record.startDate);
      const end = new Date(record.endDate);
      if (start > end) errors.push('Start date cannot be after end date');
    }

    return errors;
  };

  const parseCSV = (csvText: string): LeaveRecord[] => {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    const records: LeaveRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length >= 5) {
        records.push({
          employeeEmail: values[0] || '',
          startDate: values[1] || '',
          endDate: values[2] || '',
          leaveType: values[3] || 'Planned Leave',
          reason: values[4] || '',
          hours: values[5] ? parseInt(values[5]) : 8
        });
      }
    }

    return records;
  };

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setCsvData(text);
      };
      reader.readAsText(file);
    }
  };

  const addManualRecord = () => {
    setManualRecords([...manualRecords, {
      employeeEmail: '',
      startDate: '',
      endDate: '',
      leaveType: 'Planned Leave',
      reason: '',
      hours: 8
    }]);
  };

  const removeManualRecord = (index: number) => {
    setManualRecords(manualRecords.filter((_, i) => i !== index));
  };

  const updateManualRecord = (index: number, field: keyof LeaveRecord, value: string | number) => {
    const updated = [...manualRecords];
    updated[index] = { ...updated[index], [field]: value };
    setManualRecords(updated);
  };

  const handleUpload = async () => {
    setErrors([]);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      let records: LeaveRecord[] = [];

      if (uploadMethod === 'csv') {
        records = parseCSV(csvData);
      } else {
        records = manualRecords;
      }

      // Validate all records
      const allErrors: string[] = [];
      records.forEach((record, index) => {
        const recordErrors = validateRecord(record);
        if (recordErrors.length > 0) {
          allErrors.push(`Record ${index + 1}: ${recordErrors.join(', ')}`);
        }
      });

      if (allErrors.length > 0) {
        setErrors(allErrors);
        setIsUploading(false);
        return;
      }

      // Prepare bulk upload data
      const bulkData = [];
      for (const record of records) {
        // Calculate dates between start and end
        const start = new Date(record.startDate);
        const end = new Date(record.endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          bulkData.push({
            employeeEmail: record.employeeEmail,
            startDate: d.toISOString().split('T')[0],
            endDate: d.toISOString().split('T')[0],
            leaveType: record.leaveType,
            reason: record.reason,
            hours: record.hours || 8
          });
        }
      }

      // Upload all records at once using bulk endpoint
      let successCount = 0;
      try {
        const result = await createBulkLeaves(bulkData).unwrap();
        successCount = result.summary.successful;

        if (result.summary.failed > 0) {
          // Add failed records to errors
          result.results.forEach((item: any) => {
            if (!item.success) {
              allErrors.push(`${item.employeeEmail}: ${item.error}`);
            }
          });
        }
      } catch (error) {
        console.error('Bulk upload failed:', error);
        allErrors.push('Bulk upload failed. Please try again.');
      }

      setUploadProgress(100);

      if (allErrors.length === 0) {
        toast.success(`Successfully uploaded ${successCount} leave records!`);
        setIsOpen(false);
        onUploadComplete();
        // Reset form
        setCsvData('');
        setManualRecords([{
          employeeEmail: '',
          startDate: '',
          endDate: '',
          leaveType: 'Planned Leave',
          reason: '',
          hours: 8
        }]);
      } else {
        setErrors(allErrors);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setErrors(['Upload failed. Please try again.']);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const downloadCSVTemplate = () => {
    const template = `Employee Email,Start Date,End Date,Leave Type,Reason,Hours
jai@theyellow.network,2024-12-17,2024-12-17,Planned Leave,For his sister's operation,8
sudharshan@theyellow.network,2024-12-23,2024-12-27,Planned Leave,Vacation,8
gg@theyellownetwork.com,2024-12-26,2024-12-27,WFH,Work from home,8
anand@theyellow.network,2024-12-30,2024-12-30,Permission,Personal work,2
rakesh@theyellow.network,2024-12-30,2024-12-30,OD,Official duty,8`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leave_upload_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="ui-button ui-button-primary bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
      >
        Bulk Upload Leave Data
      </button>

      {isOpen && (
        <Dialog title="Import time-off records" description="Upload a CSV or enter multiple requests together." onClose={() => setIsOpen(false)} busy={isUploading} wide>
            <div className="mt-3">


              {/* Upload Method Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Method
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="csv"
                      checked={uploadMethod === 'csv'}
                      onChange={(e) => setUploadMethod(e.target.value as 'csv' | 'manual')}
                      className="ui-check mr-2"
                    />
                    CSV Upload
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="manual"
                      checked={uploadMethod === 'manual'}
                      onChange={(e) => setUploadMethod(e.target.value as 'csv' | 'manual')}
                      className="ui-check mr-2"
                    />
                    Manual Entry
                  </label>
                </div>
              </div>

              {/* CSV Upload */}
              {uploadMethod === 'csv' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CSV File
                  </label>
                  <input aria-label="CSV File"
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="ui-file-control block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={downloadCSVTemplate}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      Download CSV Template
                    </button>
                  </div>
                  {csvData && (
                    <div className="mt-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        CSV Preview
                      </label>
                      <textarea aria-label="CSV Preview"
                        value={csvData}
                        onChange={(e) => setCsvData(e.target.value)}
                        rows={5}
                        className="ui-control w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="CSV data will appear here..."
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Manual Entry */}
              {uploadMethod === 'manual' && (
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Leave Records
                    </label>
                    <button
                      type="button"
                      onClick={addManualRecord}
                      className="ui-button ui-button-primary text-sm bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                    >
                      + Add Record
                    </button>
                  </div>

                  {manualRecords.map((record, index) => (
                    <div key={index} className="border border-gray-200 rounded-md p-3 mb-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Employee Email
                          </label>
                          <input aria-label="Employee Email"
                            type="email"
                            value={record.employeeEmail}
                            onChange={(e) => updateManualRecord(index, 'employeeEmail', e.target.value)}
                            className="ui-control w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                            placeholder="employee@company.com"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Leave Type
                          </label>
                          <select aria-label="Leave Type"
                            value={record.leaveType}
                            onChange={(e) => updateManualRecord(index, 'leaveType', e.target.value)}
                            className="ui-control w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                          >
                            {leaveTypes.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Start Date
                          </label>
                          <input aria-label="Start Date"
                            type="date"
                            value={record.startDate}
                            onChange={(e) => updateManualRecord(index, 'startDate', e.target.value)}
                            className="ui-control w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            End Date
                          </label>
                          <input aria-label="End Date"
                            type="date"
                            value={record.endDate}
                            onChange={(e) => updateManualRecord(index, 'endDate', e.target.value)}
                            className="ui-control w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Hours
                          </label>
                          <input aria-label="Hours"
                            type="number"
                            value={record.hours}
                            onChange={(e) => updateManualRecord(index, 'hours', parseInt(e.target.value))}
                            className="ui-control w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                            min="1"
                            max="24"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Reason
                          </label>
                          <input aria-label="Reason"
                            type="text"
                            value={record.reason}
                            onChange={(e) => updateManualRecord(index, 'reason', e.target.value)}
                            className="ui-control w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                            placeholder="Reason for leave"
                          />
                        </div>
                      </div>

                      {manualRecords.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeManualRecord(index)}
                          className="ui-button ui-button-secondary mt-2 text-sm text-red-600 hover:text-red-800 underline"
                        >
                          Remove Record
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Progress Bar */}
              {isUploading && (
                <div className="mb-4">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Uploading... {Math.round(uploadProgress)}%
                  </p>
                </div>
              )}

              {/* Error Display */}
              {errors.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <h4 className="text-sm font-medium text-red-800 mb-2">Errors:</h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    {errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="ui-button ui-button-secondary px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={isUploading || (uploadMethod === 'csv' && !csvData) || (uploadMethod === 'manual' && manualRecords.some(r => !r.employeeEmail || !r.startDate || !r.endDate || !r.reason))}
                  className="ui-button ui-button-primary px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? 'Uploading...' : 'Upload Leave Data'}
                </button>
              </div>
            </div>
          </Dialog>
      )}
    </>
  );
}
