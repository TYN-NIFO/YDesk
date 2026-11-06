const rbac = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Specific role checkers
const requireAdmin = rbac(['admin']);
const requireSupervisor = rbac(['supervisor', 'admin']);
const requireFinanceManager = rbac(['finance_manager', 'admin']);
const requireEmployee = rbac(['employee', 'supervisor', 'finance_manager', 'admin']);

// Row-level security for claims
const canAccessClaim = async (req, res, next) => {
  const claimId = req.params.id;
  const user = req.user;

  try {
    const Claim = (await import('../models/Claim.js')).default;
    const claim = await Claim.findById(claimId);

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Admin can access all claims
    if (user.role === 'admin') {
      req.claim = claim;
      return next();
    }

    // Employee can only access their own claims
    if (claim.employeeId.toString() === user._id.toString()) {
      req.claim = claim;
      return next();
    }

    // Supervisor can access claims of assigned employees
    if (user.role === 'supervisor') {
      const User = (await import('../models/User.js')).default;
      const assignedEmployees = await User.find({
        $or: [
          { assignedSupervisor1: user._id },
          { assignedSupervisor2: user._id }
        ]
      }).select('_id');

      const employeeIds = assignedEmployees.map(emp => emp._id.toString());
      if (employeeIds.includes(claim.employeeId.toString())) {
        req.claim = claim;
        return next();
      }
    }

    // Finance manager can access all claims for complete oversight
    if (user.role === 'finance_manager') {
      // Finance managers should have access to all claims for complete oversight
      req.claim = claim;
      return next();
    }

    // Executives (CEO/CTO) can access all claims for final approval
    if (user.role === 'executive') {
      req.claim = claim;
      return next();
    }

    return res.status(403).json({ error: 'Access denied to this claim' });
  } catch (error) {
    console.error('Error in canAccessClaim:', error);
    res.status(500).json({ error: 'Error checking claim access' });
  }
};

// Row-level security for users
const canAccessUser = async (req, res, next) => {
  const targetUserId = req.params.id;
  const user = req.user;

  // Admin can access all users
  if (user.role === 'admin') {
    return next();
  }

  // Users can only access their own profile
  if (targetUserId === user._id.toString()) {
    return next();
  }

  return res.status(403).json({ error: 'Access denied to this user' });
};

export {
  rbac,
  requireAdmin,
  requireSupervisor,
  requireFinanceManager,
  requireEmployee,
  canAccessClaim,
  canAccessUser
};
