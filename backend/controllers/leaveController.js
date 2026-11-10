import { calendarDayStart, calendarPeriod, overlapQuery } from '../services/leaveDates.js';
import Leave from '../models/Leave.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { createAuditLog } from './authController.js';
import { getNextLeaveSequence } from '../services/counterService.js';

// Create a new leave request
const createLeave = async (req, res) => {
  try {
    const { type, startDate, endDate, hours, reason, timezone = 'Asia/Kolkata' } = req.body;

    // Validation
    if (!type || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Type, start date, and end date are required'
      });
    }

    // Special validation for Permission type
    if (type === 'Permission') {
      if (!hours || hours <= 0 || hours > 24) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'Hours must be between 1 and 24 for Permission type'
        });
      }
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Invalid date format'
      });
    }

    if (end < start) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'End date cannot be before start date'
      });
    }

    // Generate unique leave ID using atomic counter
    const seq = await getNextLeaveSequence();
    const year = new Date().getFullYear();
    const leaveId = `leave_${year}_${String(seq).padStart(5, '0')}`;

    // Create leave request
    const leave = new Leave({
      leaveId,
      employeeId: req.user._id,
      type,
      startDate: start,
      endDate: end,
      isFullDay: type !== 'Permission',
      hours: type === 'Permission' ? hours : null,
      reason: reason || '',
      timezone,
      createdBy: req.user._id
    });

    // Auto-approve if user is an executive
    if (req.user.role === 'executive') {
      leave.status = 'approved';
      leave.approval = {
        executiveApproved: true,
        financeApproved: true,
        approvedBy: req.user._id,
        approvedAt: new Date(),
        notes: 'Auto-approved by executive system'
      };
    }

    await leave.save();

    // Populate employee details
    await leave.populate('employeeId', 'name email');

    // Create audit log
    await createAuditLog(req.user._id, 'LEAVE_CREATE', 'LEAVE', {
      leaveId: leave.leaveId,
      type: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      message: 'Leave request created successfully',
      leave: leave.toPublicJSON()
    });
  } catch (error) {
    console.error('Create leave error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create leave request' });
  }
};

// Get user's leave requests
const getUserLeaves = async (req, res) => {
  try {
    const { year, month, status, type, page = 1, limit = 50 } = req.query;
    const userId = req.user._id;

    // Build query
    const query = { employeeId: userId };

    // Include requests that cross a month or year boundary.
    if (year) {
      const period = calendarPeriod(Number(year), month ? Number(month) : undefined);
      Object.assign(query, overlapQuery(period.start, period.end));
    }

    if (status) {
      query.status = status;
    }

    if (type) {
      query.type = type;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get leaves with pagination
    const leaves = await Leave.find(query)
      .populate('employeeId', 'name email')
      .populate('approval.approvedBy', 'name email')
      .sort({ startDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Leave.countDocuments(query);

    // Calculate summary statistics for the year
    let yearSummary = null;
    if (year) {
      const yearQuery = {
        employeeId: userId,
        startDate: {
          $gte: new Date(parseInt(year), 0, 1),
          $lt: new Date(parseInt(year) + 1, 0, 1)
        },
        status: 'approved'
      };

      const yearLeaves = await Leave.find(yearQuery);

      yearSummary = {
        totalLeaveDays: 0,
        plannedLeaveDays: 0,
        unplannedLeaveDays: 0,
        wfhDays: 0,
        permissionHours: 0,
        businessTripDays: 0,
        odDays: 0,
        flexiDays: 0
      };

      yearLeaves.forEach(leave => {
        const days = leave.durationInDays;

        switch (leave.type) {
          case 'Planned Leave':
            yearSummary.plannedLeaveDays += days;
            yearSummary.totalLeaveDays += days;
            break;
          case 'Unplanned Leave':
            yearSummary.unplannedLeaveDays += days;
            yearSummary.totalLeaveDays += days;
            break;
          case 'WFH':
            yearSummary.wfhDays += days;
            break;
          case 'Permission':
            yearSummary.permissionHours += leave.hours || 0;
            yearSummary.totalLeaveDays += days;
            break;
          case 'Business Trip':
            yearSummary.businessTripDays += days;
            break;
          case 'OD':
            yearSummary.odDays += days;
            break;
          case 'Flexi':
            yearSummary.flexiDays += days;
            break;
        }
      });
    }

    res.json({
      leaves: leaves.map(leave => leave.toPublicJSON()),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      yearSummary
    });
  } catch (error) {
    console.error('Get user leaves error:', error);
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
};

// Get pending leave requests (for CTO/CEO approval)
const getPendingLeaves = async (req, res) => {
  try {


    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const pendingLeaves = await Leave.find({ status: 'submitted' })
      .populate('employeeId', 'name email department')
      .sort({ createdAt: -1 }) // Newest first for dashboard visibility
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Leave.countDocuments({ status: 'submitted' });

    res.json({
      leaves: pendingLeaves.map(leave => leave.toPublicJSON()),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get pending leaves error:', error);
    res.status(500).json({ error: 'Failed to fetch pending leaves' });
  }
};

// Approve or reject a leave request
const approveLeave = async (req, res) => {
  try {
    const { leaveId } = req.params;
    const { action, notes = '', rejectionReason = '' } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Action must be either "approve" or "reject"'
      });
    }

    // Find the leave request
    const leave = await Leave.findById(leaveId).populate('employeeId', 'name email');

    if (!leave) {
      return res.status(404).json({
        error: 'Leave not found',
        details: 'The specified leave request does not exist'
      });
    }

    // Check authorization
    if (!leave.canApprove(req.user)) {
      return res.status(403).json({
        error: 'Access denied',
        details: 'You are not authorized to approve this leave request'
      });
    }

    // Update leave status using findByIdAndUpdate to avoid validation issues
    const updateData = {
      status: action === 'approve' ? 'approved' : 'rejected',
      'approval.approvedBy': req.user._id,
      'approval.approvedAt': new Date(),
      'approval.notes': notes
    };

    if (action === 'reject') {
      updateData['approval.rejectionReason'] = rejectionReason;
    }

    const updatedLeave = await Leave.findByIdAndUpdate(
      leaveId,
      updateData,
      { new: true, runValidators: false }
    ).populate('employeeId', 'name email');

    // Create audit log
    await createAuditLog(req.user._id, `LEAVE_${action.toUpperCase()}`, 'LEAVE', {
      leaveId: updatedLeave.leaveId,
      employeeId: updatedLeave.employeeId._id,
      employeeName: updatedLeave.employeeId.name,
      type: updatedLeave.type,
      startDate: updatedLeave.startDate,
      endDate: updatedLeave.endDate,
      notes,
      rejectionReason,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      message: `Leave request ${action}d successfully`,
      leave: updatedLeave.toPublicJSON()
    });
  } catch (error) {
    console.error('Approve leave error:', error);
    res.status(500).json({ error: 'Failed to process leave approval' });
  }
};

// Update a leave request (only if submitted)
const updateLeave = async (req, res) => {
  try {
    const { leaveId } = req.params;
    const { type, startDate, endDate, hours, reason, timezone } = req.body;

    const leave = await Leave.findById(leaveId);

    if (!leave) {
      return res.status(404).json({
        error: 'Leave not found',
        details: 'The specified leave request does not exist'
      });
    }

    // Check if user can edit this leave
    if (!leave.canEdit(req.user._id)) {
      return res.status(403).json({
        error: 'Access denied',
        details: 'You can only edit your own submitted leave requests'
      });
    }

    // Validate updates
    if (type === 'Permission') {
      if (!hours || hours <= 0 || hours > 24) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'Hours must be between 1 and 24 for Permission type'
        });
      }
    }

    // Update fields
    if (type) leave.type = type;
    if (startDate) leave.startDate = new Date(startDate);
    if (endDate) leave.endDate = new Date(endDate);
    if (hours !== undefined) leave.hours = type === 'Permission' ? hours : null;
    if (reason !== undefined) leave.reason = reason;
    if (timezone) leave.timezone = timezone;

    leave.isFullDay = leave.type !== 'Permission';

    await leave.save();

    // Create audit log
    await createAuditLog(req.user._id, 'LEAVE_UPDATE', 'LEAVE', {
      leaveId: leave.leaveId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      message: 'Leave request updated successfully',
      leave: leave.toPublicJSON()
    });
  } catch (error) {
    console.error('Update leave error:', error);
    res.status(500).json({ error: 'Failed to update leave request' });
  }
};

// Delete a leave request (only if submitted)
const deleteLeave = async (req, res) => {
  try {
    const { leaveId } = req.params;

    const leave = await Leave.findById(leaveId);

    if (!leave) {
      return res.status(404).json({
        error: 'Leave not found',
        details: 'The specified leave request does not exist'
      });
    }

    // Check if user can delete this leave
    if (!leave.canDelete(req.user._id)) {
      return res.status(403).json({
        error: 'Access denied',
        details: 'You can only delete your own submitted leave requests'
      });
    }

    await Leave.findByIdAndDelete(leaveId);

    // Create audit log
    await createAuditLog(req.user._id, 'LEAVE_DELETE', 'LEAVE', {
      leaveId: leave.leaveId,
      type: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      message: 'Leave request deleted successfully'
    });
  } catch (error) {
    console.error('Delete leave error:', error);
    res.status(500).json({ error: 'Failed to delete leave request' });
  }
};

// Get organization-wide leave analytics (for executives)
const getLeaveAnalytics = async (req, res) => {
  try {


    const { year = new Date().getFullYear(), month } = req.query;

    // Date range
    let startDate, endDate;
    if (month) {
      startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      endDate = new Date(parseInt(year), parseInt(month), 1);
    } else {
      startDate = new Date(parseInt(year), 0, 1);
      endDate = new Date(parseInt(year) + 1, 0, 1);
    }

    // Get all approved leaves in the date range
    const leaves = await Leave.find({
      status: 'approved',
      startDate: { $gte: startDate, $lt: endDate }
    }).populate('employeeId', 'name email department');

    // Get all active employees
    const employees = await User.find({ isActive: true }).select('name email department');

    // Calculate organization summary
    const orgSummary = {
      totalEmployees: employees.length,
      employeesOnLeave: 0,
      totalLeaveDays: 0,
      leavesByType: {},
      leavesByDepartment: {},
      employeeSummaries: []
    };

    // Group leaves by employee
    const employeeLeaves = {};
    leaves.forEach(leave => {
      const empId = leave.employeeId._id.toString();
      if (!employeeLeaves[empId]) {
        employeeLeaves[empId] = {
          employee: leave.employeeId,
          leaves: [],
          summary: {
            totalLeaveDays: 0,
            plannedLeaveDays: 0,
            unplannedLeaveDays: 0,
            wfhDays: 0,
            permissionHours: 0,
            businessTripDays: 0,
            odDays: 0,
            flexiDays: 0
          }
        };
      }
      employeeLeaves[empId].leaves.push(leave);
    });

    // Calculate summaries
    Object.values(employeeLeaves).forEach(({ employee, leaves, summary }) => {
      leaves.forEach(leave => {
        const days = leave.durationInDays;

        // Update by type
        if (!orgSummary.leavesByType[leave.type]) {
          orgSummary.leavesByType[leave.type] = 0;
        }
        orgSummary.leavesByType[leave.type] += days;

        // Update by department
        const dept = employee.department || 'Unknown';
        if (!orgSummary.leavesByDepartment[dept]) {
          orgSummary.leavesByDepartment[dept] = 0;
        }
        orgSummary.leavesByDepartment[dept] += days;

        // Update employee summary and org-level leave totals
        switch (leave.type) {
          case 'Planned Leave':
            summary.plannedLeaveDays += days;
            summary.totalLeaveDays += days;
            orgSummary.totalLeaveDays += days;
            break;
          case 'Unplanned Leave':
            summary.unplannedLeaveDays += days;
            summary.totalLeaveDays += days;
            orgSummary.totalLeaveDays += days;
            break;
          case 'WFH':
            summary.wfhDays += days;
            break;
          case 'Permission':
            summary.permissionHours += leave.hours || 0;
            summary.totalLeaveDays += days;
            orgSummary.totalLeaveDays += days;
            break;
          case 'Business Trip':
            summary.businessTripDays += days;
            break;
          case 'OD':
            summary.odDays += days;
            break;
          case 'Flexi':
            summary.flexiDays += days;
            break;
        }
      });

      orgSummary.employeeSummaries.push({
        employee: {
          id: employee._id,
          name: employee.name,
          email: employee.email,
          department: employee.department
        },
        ...summary
      });
    });

    // Add employees with no leaves
    employees.forEach(emp => {
      const empId = emp._id.toString();
      if (!employeeLeaves[empId]) {
        orgSummary.employeeSummaries.push({
          employee: {
            id: emp._id,
            name: emp.name,
            email: emp.email,
            department: emp.department
          },
          totalLeaveDays: 0,
          plannedLeaveDays: 0,
          unplannedLeaveDays: 0,
          wfhDays: 0,
          permissionHours: 0,
          businessTripDays: 0,
          odDays: 0,
          flexiDays: 0
        });
      }
    });

    orgSummary.employeesOnLeave = Object.keys(employeeLeaves).length;

    // Sort employee summaries by total leave days
    orgSummary.employeeSummaries.sort((a, b) => b.totalLeaveDays - a.totalLeaveDays);

    res.json({
      period: month ? `${year}-${String(month).padStart(2, '0')}` : year.toString(),
      summary: orgSummary
    });
  } catch (error) {
    console.error('Get leave analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch leave analytics' });
  }
};

// Get today's leave status (who is currently on leave/WFH)
const getTodayLeaves = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayLeaves = await Leave.find({
      status: 'approved',
      startDate: { $lte: today },
      endDate: { $gte: today }
    }).populate('employeeId', 'name email department');

    const response = {
      date: today.toISOString().split('T')[0],
      employees: todayLeaves.map(leave => ({
        employee: {
          id: leave.employeeId._id,
          name: leave.employeeId.name,
          email: leave.employeeId.email,
          department: leave.employeeId.department
        },
        leaveType: leave.type,
        reason: leave.reason,
        isFullDay: leave.isFullDay,
        hours: leave.hours
      }))
    };

    res.json(response);
  } catch (error) {
    console.error('Get today leaves error:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s leaves' });
  }
};

// Get leaves within a date range for calendar view
const getLeavesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Start date and end date are required'
      });
    }

    const start = calendarDayStart(startDate);
    const lastDay = calendarDayStart(endDate);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(lastDay.getTime()) || lastDay < start) {
      return res.status(400).json({ error: 'Use valid YYYY-MM-DD dates with end date on or after start date' });
    }
    const end = new Date(lastDay.getTime() + 86400000);
    const query = overlapQuery(start, end);

    // Find leaves that overlap with the date range
    // Show all leaves (submitted, approved, rejected) for calendar visibility
    const leaves = await Leave.find(query).populate('employeeId', 'name email department');

    const response = {
      startDate,
      endDate,
      leaves: leaves.map(leave => ({
        id: leave._id,
        startDate: leave.startDate.toISOString(),
        endDate: leave.endDate.toISOString(),
        leaveType: leave.type,
        status: leave.status,
        reason: req.user.role === 'executive' || String(leave.employeeId._id) === String(req.user._id) ? leave.reason : undefined,
        hours: leave.hours,
        isFullDay: leave.isFullDay,
        employee: {
          id: leave.employeeId._id,
          name: leave.employeeId.name,
          email: leave.employeeId.email,
          department: leave.employeeId.department
        },
        employeeEmail: leave.employeeId.email
      }))
    };

    res.json(response);
  } catch (error) {
    console.error('Get leaves by date range error:', error);
    res.status(500).json({ error: 'Failed to fetch leaves by date range' });
  }
};

// Bulk upload leave data (CTO/CEO only)
const createBulkLeaves = async (req, res) => {
  try {


    const { leaves } = req.body;

    if (!leaves || !Array.isArray(leaves) || leaves.length === 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Leaves array is required and must not be empty'
      });
    }

    if (leaves.length > 100) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Maximum 100 leaves can be uploaded at once'
      });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const leaveData of leaves) {
      try {
        // Validate required fields
        if (!leaveData.employeeEmail || !leaveData.startDate || !leaveData.endDate || !leaveData.leaveType) {
          results.push({
            employeeEmail: leaveData.employeeEmail || 'Unknown',
            success: false,
            error: 'Missing required fields'
          });
          errorCount++;
          continue;
        }

        // Find employee by email
        const employee = await User.findOne({ email: leaveData.employeeEmail, isActive: true });
        if (!employee) {
          results.push({
            employeeEmail: leaveData.employeeEmail,
            success: false,
            error: 'Employee not found or inactive'
          });
          errorCount++;
          continue;
        }

        // Parse dates
        const startDate = new Date(leaveData.startDate);
        const endDate = new Date(leaveData.endDate);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          results.push({
            employeeEmail: leaveData.employeeEmail,
            success: false,
            error: 'Invalid date format'
          });
          errorCount++;
          continue;
        }

        if (endDate < startDate) {
          results.push({
            employeeEmail: leaveData.employeeEmail,
            success: false,
            error: 'End date cannot be before start date'
          });
          errorCount++;
          continue;
        }

        // Generate unique leave ID using atomic counter
        const seq = await getNextLeaveSequence();
        const year = new Date().getFullYear();
        const leaveId = `leave_${year}_${String(seq).padStart(5, '0')}`;

        // Create leave record
        const leave = new Leave({
          leaveId,
          employeeId: employee._id,
          type: leaveData.leaveType,
          startDate: startDate,
          endDate: endDate,
          isFullDay: leaveData.leaveType !== 'Permission',
          hours: leaveData.leaveType === 'Permission' ? (leaveData.hours || 8) : null,
          reason: leaveData.reason || '',
          timezone: 'Asia/Kolkata',
          status: 'approved', // Bulk upload leaves are pre-approved
          createdBy: req.user._id,
          approval: {
            approvedBy: req.user._id,
            approvedAt: new Date(),
            notes: 'Bulk uploaded'
          }
        });

        await leave.save();

        // Create audit log
        await createAuditLog(req.user._id, 'LEAVE_BULK_CREATE', 'LEAVE', {
          leaveId: leave.leaveId,
          employeeId: employee._id,
          employeeName: employee.name,
          type: leave.type,
          startDate: leave.startDate,
          endDate: leave.endDate,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        results.push({
          employeeEmail: leaveData.employeeEmail,
          success: true,
          leaveId: leave.leaveId
        });
        successCount++;

      } catch (error) {
        console.error(`Error creating leave for ${leaveData.employeeEmail}:`, error);
        results.push({
          employeeEmail: leaveData.employeeEmail,
          success: false,
          error: error.message || 'Unknown error'
        });
        errorCount++;
      }
    }

    res.status(200).json({
      message: `Bulk upload completed. ${successCount} successful, ${errorCount} failed.`,
      summary: {
        total: leaves.length,
        successful: successCount,
        failed: errorCount
      },
      results: results
    });

  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ error: 'Failed to process bulk upload' });
  }
};

export {
  createLeave,
  getUserLeaves,
  getPendingLeaves,
  approveLeave,
  updateLeave,
  deleteLeave,
  getLeaveAnalytics,
  getTodayLeaves,
  getLeavesByDateRange,
  createBulkLeaves
};