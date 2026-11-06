'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { RootState } from '@/lib/store';
import { useGetClaimsQuery, useGetClaimStatsQuery, useGetUsersQuery, useLogoutMutation } from '@/lib/api';
import { useDispatch } from 'react-redux';
import { logout } from '@/lib/slices/authSlice';
import authService from '@/lib/authService';
import toast from 'react-hot-toast';
import {
  LogOut,
  User,
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  Shield,
  Settings,
  Users,
  Eye,
  Edit,
  Trash2,
  AlertCircle,
  FolderOpen,
  Plus,
  Calendar,
  Plane
} from 'lucide-react';
import PolicyManager from './PolicyManager';
import CategoryManager from './CategoryManager';
import TravelGuidelines from './TravelGuidelines';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const { user } = useSelector((state: RootState) => state.auth);
  const { data: claimsData, isLoading: claimsLoading, error: claimsError } = useGetClaimsQuery({ limit: 1000 });
  const { data: claimStats } = useGetClaimStatsQuery({});
  const claims = claimsData?.claims || [];
  const { data: users, isLoading: usersLoading } = useGetUsersQuery({});
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

  // Handle submit claim
  const handleSubmitClaim = () => {
    router.push('/submit-claim');
  };

  // Calculate statistics
  const calculateStats = () => {
    if (!claimStats) return { total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0 };

    const countByStatus = (status: string) =>
      claimStats.statusStats?.find((item: { _id: string }) => item._id === status)?.count || 0;

    return {
      total: claimStats.totalClaims || 0,
      pending: countByStatus('submitted'),
      approved: countByStatus('approved') + countByStatus('finance_approved') + countByStatus('paid') + countByStatus('done'),
      rejected: countByStatus('rejected'),
      totalAmount: claimStats.totalAmount || 0
    };
  };

  const stats = calculateStats();

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'policy', label: 'Policy', icon: Settings },
    { id: 'categories', label: 'Categories', icon: FolderOpen },
    { id: 'travel-guidelines', label: 'Travel Guidelines', icon: Plane },
    { id: 'leave-dashboard', label: 'Leave Dashboard', icon: Calendar }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            {/* Statistics Cards */}
            <div className="ui-kpi-grid">
              <div className="ui-kpi-card">
                <span className="ui-kpi-icon bg-blue-100 text-blue-600"><FileText size={18} /></span>
                <div className="ui-kpi-body">
                  <p className="ui-kpi-label">Total Claims</p>
                  <p className="ui-kpi-value">{stats.total}</p>
                </div>
              </div>

              <div className="ui-kpi-card">
                <span className="ui-kpi-icon bg-yellow-100 text-yellow-600"><Clock size={18} /></span>
                <div className="ui-kpi-body">
                  <p className="ui-kpi-label">Pending</p>
                  <p className="ui-kpi-value">{stats.pending}</p>
                </div>
              </div>

              <div className="ui-kpi-card">
                <span className="ui-kpi-icon bg-green-100 text-green-600"><CheckCircle size={18} /></span>
                <div className="ui-kpi-body">
                  <p className="ui-kpi-label">Approved</p>
                  <p className="ui-kpi-value">{stats.approved}</p>
                </div>
              </div>

              <div className="ui-kpi-card">
                <span className="ui-kpi-icon bg-red-100 text-red-600"><AlertCircle size={18} /></span>
                <div className="ui-kpi-body">
                  <p className="ui-kpi-label">Rejected</p>
                  <p className="ui-kpi-value">{stats.rejected}</p>
                </div>
              </div>
            </div>

            {/* Total Amount Card */}
            <div className="ui-kpi-card">
              <span className="ui-kpi-icon bg-green-100 text-green-600"><DollarSign size={18} /></span>
              <div className="ui-kpi-body">
                <p className="ui-kpi-label">Total Claimed Amount</p>
                <p className="ui-kpi-value">₹{stats.totalAmount.toLocaleString()}</p>
              </div>
            </div>

            {/* Recent Claims */}
            <div className="ui-panel bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Recent Claims</h2>
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
                            Employee
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
                        {claims.slice(0, 10).map((claim: any) => (
                          <tr key={claim._id} className="hover:bg-gray-50">
                            <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {claim.employeeId?.name || 'Unknown'}
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
                              <button
                                onClick={() => router.push(`/claims/${claim._id}`)}
                                className="text-blue-600 hover:text-blue-900"
                                title="View Details"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
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
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'users':
        return (
          <div className="ui-panel bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Users Management</h2>
                <p className="text-sm text-gray-600">Manage system users and their roles</p>
              </div>
              <button
                onClick={() => router.push('/admin/users')}
                className="ui-button ui-button-primary bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Open Full Management
              </button>
            </div>

            <div className="p-6">
              {usersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2">Loading users...</span>
                </div>
              ) : users && users.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="ui-table min-w-full divide-y divide-gray-200">
                    <thead className="ui-table-head bg-gray-50">
                      <tr>
                        <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((user: any) => (
                        <tr key={user._id} className="hover:bg-gray-50">
                          <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {user.name}
                          </td>
                          <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.email}
                          </td>
                          <td className="ui-table-td px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                              user.role === 'finance_manager' ? 'bg-blue-100 text-blue-800' :

                                'bg-gray-100 text-gray-800'
                              }`}>
                              {user.role.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="ui-table-td px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                              {user.isActive ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => router.push('/admin/users')}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View all users & manage →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No users found</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'policy':
        return <PolicyManager />;

      case 'categories':
        return <CategoryManager />;

      case 'leave-dashboard':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Leave Dashboard</h2>
            </div>
            <div className="ui-panel bg-white rounded-lg shadow p-6">
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">Leave Dashboard</p>
                <p className="text-sm text-gray-400">View comprehensive leave analytics and management</p>
                <button
                  onClick={() => router.push('/leave-dashboard')}
                  className="ui-button ui-button-primary mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Open Leave Dashboard
                </button>
              </div>
            </div>
          </div>
        );

      case 'travel-guidelines':
        return <TravelGuidelines />;

      default:
        return null;
      }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="ui-panel bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-purple-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-sm text-gray-600">Welcome back, {user?.name}</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={handleSubmitClaim}
                className="ui-button ui-button-primary flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Submit Claim
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
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab: any) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`ui-tab ${`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${activeTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}`}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </div>
  );
}
