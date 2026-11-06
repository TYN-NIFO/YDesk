'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/lib/store';
import AuthWrapper from '@/app/components/AuthWrapper';

import PendingLeaveApprovals from '@/app/components/PendingLeaveApprovals';
import LeaveAnalyticsDashboard from '@/app/components/LeaveAnalyticsDashboard';
import { BarChart3, ClipboardCheck } from 'lucide-react';

type ViewMode = 'approvals' | 'analytics';

export default function LeaveDashboard() {
  const auth = useSelector((state: RootState) => state.auth);
  const [currentView, setCurrentView] = useState<ViewMode>('analytics');


  const userEmail = auth.user?.email || '';
  const userRole = auth.user?.role || 'employee';

  // Check if user can access leave dashboard (executive only)
  const canAccess = userRole === 'executive' || userRole === 'admin';

  // Redirect non-authorized users
  if (!canAccess) {
    return (
      <AuthWrapper>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Restricted</h3>
            <p className="text-gray-600 mb-4">Only CTO and CEO can access the Leave Management Dashboard.</p>
            <p className="text-sm text-gray-500 mb-6">Employees can manage their leaves from the Employee Dashboard.</p>

            <div className="space-y-3">
              <button
                onClick={() => window.location.href = '/employee'}
                className="ui-button ui-button-primary w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Go to Employee Dashboard
              </button>
              <button
                onClick={() => window.location.href = '/submit-leave'}
                className="ui-button ui-button-primary w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
              >
                Submit Leave Request
              </button>
            </div>
          </div>
        </div>
      </AuthWrapper>
    );
  }

  const navigationItems = [
    { key: 'analytics' as ViewMode, label: 'Analytics', icon: <BarChart3 /> },
    { key: 'approvals' as ViewMode, label: 'Pending Approvals', icon: <ClipboardCheck /> }

  ];



  const renderContent = () => {
    switch (currentView) {
      case 'approvals':
        return <PendingLeaveApprovals />;
      case 'analytics':
        return (
          <LeaveAnalyticsDashboard
            userRole={userRole}
            userEmail={userEmail}
          />
        );
      default:
        return null;
    }
  };

  return (
    <AuthWrapper>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900">Leave Management Dashboard</h1>
                <p className="mt-2 text-sm text-gray-600">
                  Organization-wide leave analytics and approval management
                </p>
              </div>


            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mb-8">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8 overflow-x-auto">
                {navigationItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setCurrentView(item.key)}
                    className={`ui-tab ${`flex items-center space-x-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${currentView === item.key
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Content Area */}
          <div className="min-h-[500px]">
            {renderContent()}
          </div>

          {/* Help Section */}
          <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-medium text-blue-900 mb-4">Leave Management Dashboard</h3>
            <div className="text-sm text-blue-800">
              <div>
                <h4 className="font-medium mb-2">For CTO/CEO:</h4>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Review pending approvals in the "Pending Approvals" tab</li>
                  <li>View organization-wide analytics and trends</li>
                  <li>Monitor employee leave patterns and usage</li>
                  <li>Track today's leave status and team availability</li>
                  <li>Access detailed employee leave summaries</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Leave Types Reference */}
          <div className="mt-8 bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Leave Types Reference</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              {[
                { type: 'Planned Leave', desc: 'Pre-planned time off', color: 'bg-green-100 text-green-800' },
                { type: 'Unplanned Leave', desc: 'Urgent/emergency leave', color: 'bg-red-100 text-red-800' },
                { type: 'WFH', desc: 'Work from home', color: 'bg-blue-100 text-blue-800' },
                { type: 'Permission', desc: 'Fractional hours (0-24)', color: 'bg-yellow-100 text-yellow-800' },
                { type: 'Business Trip', desc: 'Official travel', color: 'bg-purple-100 text-purple-800' },
                { type: 'OD', desc: 'Official duty', color: 'bg-indigo-100 text-indigo-800' },
                { type: 'Flexi', desc: 'Flexible working', color: 'bg-pink-100 text-pink-800' }
              ].map((item) => (
                <div key={item.type} className="p-3 border border-gray-200 rounded-lg">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${item.color} mb-2`}>
                    {item.type}
                  </span>
                  <p className="text-gray-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AuthWrapper>
  );
}
