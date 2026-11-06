'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, X, ChevronDown } from 'lucide-react';
import { useGetEmployeeNamesQuery } from '../../lib/api';

interface FilterBarProps {
  onFiltersChange: (filters: FilterState) => void;
  categories?: string[];
  showEmployeeFilter?: boolean;
  showCategoryFilter?: boolean;
  showSearchFilter?: boolean;
  showDateFilter?: boolean;
  className?: string;
}

export interface FilterState {
  search: string;
  employeeId: string;
  category: string;
  startDate: string;
  endDate: string;
  status: string;
}

const defaultFilters: FilterState = {
  search: '',
  employeeId: '',
  category: '',
  startDate: '',
  endDate: '',
  status: '',
};

export default function FilterBar({
  onFiltersChange,
  categories = [],
  showEmployeeFilter = true,
  showCategoryFilter = true,
  showSearchFilter = true,
  showDateFilter = true,
  className = ''
}: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const { data: employees, isLoading: employeesLoading } = useGetEmployeeNamesQuery({});

  useEffect(() => {
    onFiltersChange(filters);
  }, [filters, onFiltersChange]);

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      {/* Filter Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-900">Filters</h3>
          {hasActiveFilters && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Active
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ui-button ui-button-secondary text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
            >
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>
          )}
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="ui-button ui-button-secondary flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <span>{isExpanded ? 'Hide' : 'Show'} Filters</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            
            {/* Search Filter */}
            {showSearchFilter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input aria-label="Search"
                    type="text"
                    placeholder="Search claims..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    className="ui-control w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            {/* Employee Filter */}
            {showEmployeeFilter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employee
                </label>
                <select aria-label="Employee"
                  value={filters.employeeId}
                  onChange={(e) => handleFilterChange('employeeId', e.target.value)}
                  className="ui-control w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={employeesLoading}
                >
                  <option value="">All Employees</option>
                  {employees?.data?.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} ({employee.department || 'No Dept'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Category Filter */}
            {showCategoryFilter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select aria-label="Category"
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  className="ui-control w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select aria-label="Status"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="ui-control w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Status</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="finance_approved">Finance Approved</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            {/* Date Range Filters */}
            {showDateFilter && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input aria-label="Start Date"
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                    className="ui-control w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input aria-label="End Date"
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                    className="ui-control w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
              {Object.entries(filters).map(([key, value]) => {
                if (!value) return null;
                
                let displayValue = value;
                if (key === 'employeeId' && employees?.data) {
                  const employee = employees.data.find((emp: any) => emp.id === value);
                  displayValue = employee?.name || value;
                }
                
                return (
                  <span
                    key={key}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                  >
                    {key}: {displayValue}
                    <button
                      onClick={() => handleFilterChange(key as keyof FilterState, '')}
                      className="ml-2 text-blue-600 hover:text-blue-800"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
