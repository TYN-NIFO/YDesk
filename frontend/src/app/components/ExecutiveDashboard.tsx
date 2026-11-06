'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { RootState } from '@/lib/store';
import { useGetClaimsQuery, useGetClaimStatsQuery, useGetLeavesQuery, useLogoutMutation } from '@/lib/api';
import { useDispatch } from 'react-redux';
import { logout } from '@/lib/slices/authSlice';
import authService from '@/lib/authService';
import toast from 'react-hot-toast';
import {
  Plus,
  LogOut,
  User,
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  Edit,
  Trash2,
  Users,
  BarChart3,
  Calendar,
  Building,
  Plane
} from 'lucide-react';
import ImprovedClaimForm from './ImprovedClaimForm';
import ClaimList from './ClaimList';
import ExecutiveLeaveDashboard from './ExecutiveLeaveDashboard';
import HolidayConfiguration from './HolidayConfiguration';
import FilterBar, { FilterState } from './FilterBar';
import { categoryMaster } from '@/lib/categoryMaster';
import TravelGuidelines from './TravelGuidelines';


export default function ExecutiveDashboard() {
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'organization' | 'leave-dashboard' | 'travel-guidelines' | 'holidays'>('personal');
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { data: claimsData, isLoading: claimsLoading, error: claimsError } = useGetClaimsQuery({ limit: 1000 });
  const { data: personalClaimStats } = useGetClaimStatsQuery({ scope: 'own' });
  const { data: organizationClaimStats } = useGetClaimStatsQuery({});
  const { data: leavesData, isLoading: leavesLoading } = useGetLeavesQuery({});
  const claims = useMemo(() => claimsData?.claims || [], [claimsData]);
  const leaves = leavesData?.leaves || [];
  const [logoutMutation] = useLogoutMutation();

  const router = useRouter();
  const dispatch = useDispatch();


  // Handle logout
  const handleLogout = async () => {
    try {
      await logoutMutation(undefined).unwrap();
      await authService.logout();
      dispatch(logout());
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Logout failed, redirecting to login...');
      // Force logout even if API call fails
      await authService.logout();
      dispatch(logout());
      router.push('/login');
    }
  };

  // Calculate personal statistics
  const calculatePersonalStats = () => {
    return calculateStatsFromApi(personalClaimStats);
  };

  // Calculate organization statistics
  const calculateOrgStats = () => {
    return calculateStatsFromApi(organizationClaimStats);
  };

  const calculateStatsFromApi = (statsData: any) => {
    if (!statsData) return { total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0 };

    const countByStatus = (status: string) =>
      statsData.statusStats?.find((item: { _id: string }) => item._id === status)?.count || 0;

    return {
      total: statsData.totalClaims || 0,
      pending: countByStatus('submitted'),
      approved: countByStatus('approved') + countByStatus('finance_approved') + countByStatus('paid') + countByStatus('done'),
      rejected: countByStatus('rejected'),
      totalAmount: statsData.totalAmount || 0
    };
  };

  const personalStats = calculatePersonalStats();
  const orgStats = calculateOrgStats();

  // Filters for organization view
  const [orgFilters, setOrgFilters] = useState<FilterState>({
    search: '',
    employeeId: '',
    category: '',
    startDate: '',
    endDate: '',
    status: ''
  });

  const categoryNames = useMemo(() => categoryMaster.map(c => c.name), []);

  const filteredOrgClaims = useMemo(() => {
    if (!claims || claims.length === 0) return [];
    return claims.filter((claim: any) => {
      if (orgFilters.search) {
        const needle = orgFilters.search.toLowerCase();
        const idPart = (claim._id || '').toLowerCase();
        const employeeName = (claim.employeeId?.name || '').toLowerCase();
        const category = (claim.category || '').toLowerCase();
        if (!idPart.includes(needle) && !employeeName.includes(needle) && !category.includes(needle)) {
          return false;
        }
      }
      if (orgFilters.employeeId && claim.employeeId?._id !== orgFilters.employeeId) return false;
      if (orgFilters.category && claim.category !== orgFilters.category) return false;
      if (orgFilters.status && claim.status !== orgFilters.status) return false;

      if (orgFilters.startDate) {
        const created = new Date(claim.createdAt);
        const start = new Date(orgFilters.startDate);
        if (isFinite(created.getTime()) && created < start) return false;
      }
      if (orgFilters.endDate) {
        const created = new Date(claim.createdAt);
        const end = new Date(orgFilters.endDate);
        end.setHours(23, 59, 59, 999);
        if (isFinite(created.getTime()) && created > end) return false;
      }

      return true;
    });
  }, [claims, orgFilters]);

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="ui-panel bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Building className="h-8 w-8 text-purple-600" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Executive Dashboard</h1>
                  <p className="text-sm text-gray-600">Welcome back, {user.name} (CEO/CTO)</p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowClaimForm(true)}
                className="ui-button ui-button-primary flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Claim
              </button>

              <button
                onClick={() => router.push('/submit-leave')}
                className="ui-button ui-button-primary flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                <Clock className="h-4 w-4 mr-2" />
                Submit Leave
              </button>

              <button
                onClick={handleLogout}
                className="ui-button ui-button-secondary flex items-center px-3 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showClaimForm ? (
          <ImprovedClaimForm
            onClose={() => setShowClaimForm(false)}
            employeeId={user?._id}
          />
        ) : (
          <>
            {/* Tab Navigation */}
            <div className="mb-8">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('personal')}
                    className={`ui-tab ${`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'personal'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}`}
                  >
                    Personal View
                  </button>
                  <button
                    onClick={() => setActiveTab('organization')}
                    className={`ui-tab ${`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'organization'
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}`}
                  >
                    Organization View
                  </button>
                  <button
                    onClick={() => setActiveTab('leave-dashboard')}
                    className={`ui-tab ${`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'leave-dashboard'
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}`}
                  >
                    Leave Dashboard
                  </button>
                  <button
                    onClick={() => setActiveTab('travel-guidelines')}
                    className={`ui-tab ${`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'travel-guidelines'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}`}
                  >
                    <span className="inline-flex items-center">
                      <Plane className="h-4 w-4 mr-2" />
                      Travel Guidelines
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('holidays')}
                    className={`ui-tab ${`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'holidays'
                      ? 'border-red-500 text-red-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}`}
                  >
                    Holidays
                  </button>
                </nav>
              </div>
            </div>

            {activeTab === 'personal' ? (
              <>
                {/* Personal Statistics Cards */}
                <div className="ui-kpi-grid mb-8">
                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-blue-100 text-blue-600"><FileText size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">My Claims</p>
                      <p className="ui-kpi-value">{personalStats.total}</p>
                    </div>
                  </div>

                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-yellow-100 text-yellow-600"><Clock size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">Pending</p>
                      <p className="ui-kpi-value">{personalStats.pending}</p>
                    </div>
                  </div>

                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-green-100 text-green-600"><CheckCircle size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">Approved</p>
                      <p className="ui-kpi-value">{personalStats.approved}</p>
                    </div>
                  </div>

                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-red-100 text-red-600"><AlertCircle size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">Rejected</p>
                      <p className="ui-kpi-value">{personalStats.rejected}</p>
                    </div>
                  </div>
                </div>

                {/* Personal Total Amount Card */}
                <div className="ui-kpi-card mb-8">
                  <span className="ui-kpi-icon bg-purple-100 text-purple-600"><DollarSign size={18} /></span>
                  <div className="ui-kpi-body">
                    <p className="ui-kpi-label">My Total Claimed Amount</p>
                    <p className="ui-kpi-value">₹{personalStats.totalAmount.toLocaleString()}</p>
                  </div>
                </div>

                {/* Personal Claims List */}
                <div className="ui-panel bg-white rounded-lg shadow mb-8">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-medium text-gray-900">My Claims</h2>
                    <p className="text-sm text-gray-600">View and manage your expense claims</p>
                  </div>

                  <div className="p-6">
                    {claimsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="ml-2">Loading claims...</span>
                      </div>
                    ) : claimsError ? (
                      <div className="text-center py-8">
                        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                        <p className="text-red-600">Failed to load claims</p>
                      </div>
                    ) : claims && claims.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="ui-table min-w-full divide-y divide-gray-200">
                          <thead className="ui-table-head bg-gray-50">
                            <tr>
                              <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Claim ID
                              </th>
                              <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Category
                              </th>
                              <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Amount
                              </th>
                              <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                              </th>
                              <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Date
                              </th>
                              <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {claims.filter((claim: any) => claim.employeeId?._id === user?._id).map((claim: any) => (
                              <tr key={claim._id} className="hover:bg-gray-50">
                                <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {claim._id.slice(-8)}
                                </td>
                                <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {claim.category}
                                </td>
                                <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  ₹{claim.grandTotal?.toLocaleString() || '0'}
                                </td>
                                <td className="ui-table-td px-6 py-4 whitespace-nowrap">
                                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${claim.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                                    claim.status === 'approved' ? 'bg-green-100 text-green-800' :
                                      claim.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                        claim.status === 'finance_approved' ? 'bg-blue-100 text-blue-800' :
                                          claim.status === 'paid' ? 'bg-purple-100 text-purple-800' :
                                            'bg-gray-100 text-gray-800'
                                    }`}>
                                    {claim.status.replace('_', ' ').toUpperCase()}
                                  </span>
                                </td>
                                <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                  {new Date(claim.createdAt).toLocaleDateString()}
                                </td>
                                <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm font-medium">
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => router.push(`/claims/${claim._id}`)}
                                      className="text-blue-600 hover:text-blue-900"
                                      title="View Details"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                    {['submitted', 'rejected'].includes(claim.status) && (
                                      <button
                                        onClick={() => router.push(`/claims/${claim._id}/edit`)}
                                        className="text-green-600 hover:text-green-900"
                                        title="Edit Claim"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No claims found</p>
                        <p className="text-sm text-gray-400 mt-1">Create your first claim to get started</p>
                      </div>
                    )}
                  </div>
                </div>


              </>
            ) : activeTab === 'organization' ? (
              <>
                {/* Organization Statistics Cards */}
                <div className="ui-kpi-grid mb-8">
                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-blue-100 text-blue-600"><Users size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">Total Claims</p>
                      <p className="ui-kpi-value">{orgStats.total}</p>
                    </div>
                  </div>

                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-yellow-100 text-yellow-600"><Clock size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">Pending</p>
                      <p className="ui-kpi-value">{orgStats.pending}</p>
                    </div>
                  </div>

                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-green-100 text-green-600"><CheckCircle size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">Approved</p>
                      <p className="ui-kpi-value">{orgStats.approved}</p>
                    </div>
                  </div>

                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-red-100 text-red-600"><AlertCircle size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">Rejected</p>
                      <p className="ui-kpi-value">{orgStats.rejected}</p>
                    </div>
                  </div>
                </div>

                {/* Organization Total Amount Card */}
                <div className="ui-kpi-card mb-8">
                  <span className="ui-kpi-icon bg-purple-100 text-purple-600"><DollarSign size={18} /></span>
                  <div className="ui-kpi-body">
                    <p className="ui-kpi-label">Organization Total Claimed Amount</p>
                    <p className="ui-kpi-value">₹{orgStats.totalAmount.toLocaleString()}</p>
                  </div>
                </div>

                {/* Executive Claims Summary */}
                <div className="ui-kpi-grid mb-6">
                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-blue-100 text-blue-600"><Clock size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">Pending Financial Review</p>
                      <p className="ui-kpi-value">{claims.filter((claim: any) => claim.status === 'submitted').length}</p>
                    </div>
                  </div>

                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-green-100 text-green-600"><CheckCircle size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">Pending Payment</p>
                      <p className="ui-kpi-value">{claims.filter((claim: any) => claim.status === 'finance_approved').length}</p>
                    </div>
                  </div>

                  <div className="ui-kpi-card">
                    <span className="ui-kpi-icon bg-purple-100 text-purple-600"><DollarSign size={18} /></span>
                    <div className="ui-kpi-body">
                      <p className="ui-kpi-label">Paid Claims</p>
                      <p className="ui-kpi-value">{claims.filter((claim: any) => claim.status === 'paid').length}</p>
                    </div>
                  </div>
                </div>

                {/* Organization Filters + Claims List */}
                <div className="ui-panel bg-white rounded-lg shadow mb-8">
                  <div className="px-6 py-4 border-b border-gray-200 space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-lg font-medium text-gray-900">Executive Claims Overview</h2>
                        <p className="text-sm text-gray-600">Review claims ready for executive approval and view past successful claims</p>
                      </div>
                    </div>
                    <FilterBar
                      onFiltersChange={setOrgFilters}
                      categories={categoryNames}
                      showEmployeeFilter={true}
                      showCategoryFilter={true}
                      showSearchFilter={true}
                      showDateFilter={true}
                    />
                  </div>

                  <div className="p-6">
                    {claimsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                        <span className="ml-2">Loading claims...</span>
                      </div>
                    ) : claimsError ? (
                      <div className="text-center py-8">
                        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                        <p className="text-red-600">Failed to load claims</p>
                      </div>
                    ) : (
                      <ClaimList
                        claims={filteredOrgClaims}
                        showApprovalButtons={false}
                        showPaymentButtons={false}
                        showEmployeeName={true}
                      />
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="ui-panel bg-white rounded-lg shadow p-6">
                    <div className="flex items-center mb-4">
                      <BarChart3 className="h-6 w-6 text-blue-600 mr-2" />
                      <h3 className="text-lg font-medium text-gray-900">Analytics</h3>
                    </div>
                    <p className="text-gray-600 mb-4">View detailed analytics and reports for the organization</p>
                    <button
                      onClick={() => router.push('/admin')}
                      className="ui-button ui-button-primary w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      View Analytics
                    </button>
                  </div>

                  <div className="ui-panel bg-white rounded-lg shadow p-6">
                    <div className="flex items-center mb-4">
                      <Users className="h-6 w-6 text-green-600 mr-2" />
                      <h3 className="text-lg font-medium text-gray-900">User Management</h3>
                    </div>
                    <p className="text-gray-600 mb-4">Manage users, roles, and permissions across the organization</p>
                    <button
                      onClick={() => router.push('/admin/users')}
                      className="ui-button ui-button-primary w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors"
                    >
                      Manage Users
                    </button>
                  </div>
                </div>
              </>
            ) : activeTab === 'leave-dashboard' ? (
              <ExecutiveLeaveDashboard
                userRole={user?.role || 'executive'}
                userEmail={user?.email || ''}
              />
            ) : activeTab === 'travel-guidelines' ? (
              <TravelGuidelines />
            ) : activeTab === 'holidays' ? (
              <HolidayConfiguration />
            ) : null}
          </>
        )}
      </div>

    </div>
  );
}
``
