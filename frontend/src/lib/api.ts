import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { RootState } from './store';

// Base query with authentication
const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

// Base query with re-authentication


const baseQueryWithReauth = async (args: any, queryApi: any, extraOptions: any) => {
  let result = await baseQuery(args, queryApi, extraOptions);
  const path = typeof args === 'string' ? args : args.url;
  if (result.error?.status === 401 && !path.startsWith('/auth/')) {
    const { default: authService } = await import('./authService');
    const token = await authService.refreshToken();
    if (token) result = await baseQuery(args, queryApi, extraOptions);
  }
  return result;
};

export const api = createApi({
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Claims', 'Policy', 'Users', 'Leaves', 'Holidays', 'Grievances'],
  endpoints: (builder) => ({
    // Authentication
    token: builder.mutation({
      query: (credentials) => ({
        url: '/auth/token/',
        method: 'POST',
        body: credentials,
      }),
    }),
    refresh: builder.mutation({
      query: () => ({
        url: '/auth/refresh/',
        method: 'POST',
      }),
    }),
    logout: builder.mutation({
      query: () => ({
        url: '/auth/logout/',
        method: 'POST',
      }),
    }),
    getProfile: builder.query({
      query: () => '/auth/me/',
    }),
    updateProfile: builder.mutation({
      query: (profile) => ({
        url: '/auth/me/',
        method: 'PATCH',
        body: profile,
      }),
    }),
    uploadAvatar: builder.mutation({
      query: (file: File) => {
        const formData = new FormData();
        formData.append('avatar', file);
        return {
          url: '/auth/avatar/',
          method: 'POST',
          body: formData,
        };
      },
    }),
    checkUsername: builder.mutation({
      query: (email) => ({
        url: '/auth/check-username/',
        method: 'POST',
        body: { email },
      }),
    }),
    changePassword: builder.mutation({
      query: (passwords) => ({
        url: '/auth/change-password/',
        method: 'POST',
        body: passwords,
      }),
    }),
    forgotPassword: builder.mutation({
      query: (data) => ({
        url: '/auth/forgot-password/',
        method: 'POST',
        body: data,
      }),
    }),
    resetPassword: builder.mutation({
      query: (data) => ({
        url: '/auth/reset-password/',
        method: 'POST',
        body: data,
      }),
    }),

    // Policy
    getPolicy: builder.query({
      query: () => '/policy/current',
      transformResponse: (response: any) => response.policy,
      providesTags: ['Policy'],
    }),
    updatePolicy: builder.mutation({
      query: (policy) => ({
        url: '/policy',
        method: 'PUT',
        body: policy,
      }),
      invalidatesTags: ['Policy'],
    }),
    getPolicyHistory: builder.query({
      query: () => '/policy/history',
      providesTags: ['Policy'],
    }),

    // Claims
    createClaim: builder.mutation({
      query: ({ claimData, files, fileMapping }) => {
        const formData = new FormData();
        formData.append('claimData', JSON.stringify(claimData));
        formData.append('fileMapping', JSON.stringify(fileMapping || {}));

        // Add files to form data
        if (files && files.length > 0) {
          files.forEach((file: File) => {
            formData.append('files', file);
          });
        }

        return {
          url: '/claims',
          method: 'POST',
          body: formData,
          prepareHeaders: (headers: Headers) => {
            // Remove Content-Type header to let browser set it with boundary
            headers.delete('Content-Type');
            return headers;
          },
        };
      },
      invalidatesTags: ['Claims'],
    }),
    uploadClaimFile: builder.mutation({
      query: ({ claimId, file }: {
        claimId: string;
        file: File;
      }) => {
        const formData = new FormData();
        formData.append('file', file);

        return {
          url: `/claims/${claimId}/upload`,
          method: 'POST',
          body: formData,
          // Don't set Content-Type header - let the browser set it with boundary
          prepareHeaders: (headers: Headers) => {
            // Remove any Content-Type header to let the browser set it correctly for FormData
            headers.delete('Content-Type');
            return headers;
          },
        };
      },
      invalidatesTags: ['Claims'],
    }),
    getClaims: builder.query({
      query: (params = {}) => ({
        url: '/claims',
        params: {
          limit: 50, // Increase default limit from 20 to 50
          ...params
        },
      }),
      transformResponse: (response: any) => {
        // Return the full response object with claims array and pagination info
        return response;
      },
      providesTags: ['Claims'],
    }),
    getClaimStats: builder.query({
      query: (params = {}) => ({
        url: '/claims/stats',
        params,
      }),
      transformResponse: (response: any) => response.stats || response,
      providesTags: ['Claims'],
    }),
    getClaim: builder.query({
      query: (id) => `/claims/${id}`,
      transformResponse: (response: any) => response.claim || response,
      providesTags: (result, error, id) => [{ type: 'Claims', id }],
    }),
    updateClaim: builder.mutation({
      query: ({ id, claimData, files, fileMapping, ...claim }) => {
        // If files are provided, use FormData
        if (files && files.length > 0) {
          const formData = new FormData();
          formData.append('claimData', JSON.stringify(claimData || claim));
          formData.append('fileMapping', JSON.stringify(fileMapping || {}));

          // Add files to form data
          files.forEach((file: File) => {
            // Only add new files (not existing ones)
            if (!(file as any).isExisting) {
              formData.append('files', file);
            }
          });

          return {
            url: `/claims/${id}`,
            method: 'PATCH',
            body: formData,
            prepareHeaders: (headers: Headers) => {
              headers.delete('Content-Type');
              return headers;
            },
          };
        } else {
          // No files, use regular JSON
          return {
            url: `/claims/${id}`,
            method: 'PATCH',
            body: claimData || claim,
          };
        }
      },
      invalidatesTags: (result, error, { id }) => [
        { type: 'Claims', id },
        'Claims',
      ],
    }),
    approveClaim: builder.mutation({
      query: ({ id, action, reason, notes }) => ({
        url: `/claims/${id}/approve`,
        method: 'POST',
        body: { action, reason, notes },
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Claims', id },
        'Claims',
      ],
    }),
    financeApprove: builder.mutation({
      query: ({ id, action, reason, notes }) => ({
        url: `/claims/${id}/finance-approve`,
        method: 'POST',
        body: { action, notes, reason },
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Claims', id },
        'Claims',
      ],
    }),
    executiveApprove: builder.mutation({
      query: ({ id, action, reason, notes }) => ({
        url: `/claims/${id}/executive-approve`,
        method: 'POST',
        body: { action, notes, reason },
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Claims', id },
        'Claims',
      ],
    }),
    markPaid: builder.mutation({
      query: ({ id, channel, reference, file }) => {
        const formData = new FormData();
        formData.append('channel', channel);
        if (reference) formData.append('reference', reference);
        if (file) formData.append('file', file);
        return {
          url: `/claims/${id}/mark-paid`,
          method: 'POST',
          body: formData,
          prepareHeaders: (headers: Headers) => {
            headers.delete('Content-Type');
            return headers;
          },
        };
      },
      invalidatesTags: (result, error, { id }) => [
        { type: 'Claims', id },
        'Claims',
      ],
    }),
    deleteClaim: builder.mutation({
      query: (id) => ({
        url: `/claims/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Claims'],
    }),

    // Leaves
    createLeave: builder.mutation({
      query: (leave) => ({
        url: '/leaves',
        method: 'POST',
        body: leave,
      }),
      invalidatesTags: ['Leaves'],
    }),
    createBulkLeaves: builder.mutation({
      query: (leaves) => ({
        url: '/leaves/bulk',
        method: 'POST',
        body: { leaves },
      }),
      invalidatesTags: ['Leaves'],
    }),
    getLeaves: builder.query({
      query: (params = {}) => ({
        url: '/leaves',
        params,
      }),
      transformResponse: (response: any) => response,
      providesTags: ['Leaves'],
    }),
    getPendingLeaves: builder.query({
      query: (params = {}) => ({
        url: '/leaves/pending',
        params,
      }),
      transformResponse: (response: any) => response,
      providesTags: ['Leaves'],
    }),
    getLeaveAnalytics: builder.query({
      query: (params = {}) => ({
        url: '/leaves/analytics',
        params,
      }),
      transformResponse: (response: any) => response,
      providesTags: ['Leaves'],
    }),
    getTodayLeaves: builder.query({
      query: () => '/leaves/today',
      transformResponse: (response: any) => response,
      providesTags: ['Leaves'],
    }),
    getLeavesByDateRange: builder.query({
      query: ({ startDate, endDate }) => ({
        url: '/leaves/by-date-range',
        params: { startDate, endDate },
      }),
      transformResponse: (response: any) => response,
      providesTags: ['Leaves'],
    }),
    updateLeave: builder.mutation({
      query: ({ id, ...leave }) => ({
        url: `/leaves/${id}`,
        method: 'PUT',
        body: leave,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Leaves', id },
        'Leaves',
      ],
    }),
    approveLeave: builder.mutation({
      query: ({ id, action, notes, rejectionReason }) => ({
        url: `/leaves/${id}/approve`,
        method: 'POST',
        body: { action, notes, rejectionReason },
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Leaves', id },
        'Leaves',
      ],
    }),
    deleteLeave: builder.mutation({
      query: (id: string) => ({
        url: `/leaves/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [
        { type: 'Leaves', id },
        'Leaves',
      ],
    }),

    // Grievances
    getGrievanceMeta: builder.query({
      query: () => '/feedback/meta',
    }),
    getGrievances: builder.query({
      query: (params: { scope?: 'mine' | 'all'; status?: string; category?: string; feedbackType?: string } = {}) => ({
        url: '/feedback',
        params,
      }),
      providesTags: ['Grievances'],
    }),
    getGrievanceSummary: builder.query({
      query: () => '/feedback/summary',
      providesTags: ['Grievances'],
    }),
    getGrievance: builder.query({
      query: (grievanceId: string) => `/feedback/${grievanceId}`,
      providesTags: (result, error, grievanceId) => [{ type: 'Grievances', id: grievanceId }],
    }),
    createGrievance: builder.mutation({
      query: ({ category, subject, description, incidentDate, files, feedbackType }: {
        feedbackType?: string;
        category: string;
        subject: string;
        description: string;
        incidentDate?: string;
        files: File[];
      }) => {
        const formData = new FormData();
        formData.append('category', category);
        if (feedbackType) formData.append('feedbackType', feedbackType);
        formData.append('subject', subject);
        formData.append('description', description);
        if (incidentDate) formData.append('incidentDate', incidentDate);
        files.forEach((file) => formData.append('files', file));
        return {
          url: '/feedback',
          method: 'POST',
          body: formData,
        };
      },
      invalidatesTags: ['Grievances'],
    }),
    updateGrievanceStatus: builder.mutation({
      query: ({ grievanceId, status, note }: { grievanceId: string; status: string; note?: string }) => ({
        url: `/feedback/${grievanceId}/status`,
        method: 'PATCH',
        body: { status, note },
      }),
      invalidatesTags: (result, error, { grievanceId }) => [
        { type: 'Grievances', id: grievanceId },
        'Grievances',
      ],
    }),

    // Holidays
    getHolidays: builder.query({
      query: (params = {}) => ({
        url: '/holidays',
        params,
      }),
      providesTags: ['Holidays'],
    }),
    createHoliday: builder.mutation({
      query: (holiday) => ({
        url: '/holidays',
        method: 'POST',
        body: holiday,
      }),
      invalidatesTags: ['Holidays'],
    }),
    updateHoliday: builder.mutation({
      query: ({ id, ...holiday }) => ({
        url: `/holidays/${id}`,
        method: 'PUT',
        body: holiday,
      }),
      invalidatesTags: ['Holidays'],
    }),
    deleteHoliday: builder.mutation({
      query: (id: string) => ({
        url: `/holidays/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Holidays'],
    }),

    // Users (Admin only)
    getUsers: builder.query({
      query: (params = {}) => ({
        url: '/users',
        params,
      }),
      providesTags: ['Users'],
    }),
    createUser: builder.mutation({
      query: (user) => ({
        url: '/users',
        method: 'POST',
        body: user,
      }),
      invalidatesTags: ['Users'],
    }),
    updateUser: builder.mutation({
      query: ({ id, ...user }) => ({
        url: `/users/${id}`,
        method: 'PATCH',
        body: user,
      }),
      invalidatesTags: ['Users'],
    }),
    deactivateUser: builder.mutation({
      query: (id: string) => ({
        url: `/users/${id}/deactivate`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Users'],
    }),
    resetUserPassword: builder.mutation({
      query: ({ id, password }) => ({
        url: `/users/${id}/reset-password`,
        method: 'PATCH',
        body: { password },
      }),
      invalidatesTags: ['Users'],
    }),
    deleteUser: builder.mutation({
      query: (id) => ({
        url: `/users/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Users'],
    }),

    // Get employee names for filtering
    getEmployeeNames: builder.query({
      query: () => '/users/employee-names',
      providesTags: ['Users'],
    }),
  }),
});

export const {
  // Authentication
  useTokenMutation,
  useRefreshMutation,
  useLogoutMutation,
  useGetProfileQuery,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  useCheckUsernameMutation,
  useChangePasswordMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,

  // Policy
  useGetPolicyQuery,
  useUpdatePolicyMutation,
  useGetPolicyHistoryQuery,

  // Claims
  useCreateClaimMutation,
  useUploadClaimFileMutation,
  useGetClaimsQuery,
  useGetClaimQuery,
  useUpdateClaimMutation,
  useApproveClaimMutation,
  useFinanceApproveMutation,
  useExecutiveApproveMutation,
  useMarkPaidMutation,
  useDeleteClaimMutation,
  useGetClaimStatsQuery,

  // Users
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeactivateUserMutation,
  useResetUserPasswordMutation,
  useDeleteUserMutation,
  // Leaves
  useCreateLeaveMutation,
  useCreateBulkLeavesMutation,
  useGetLeavesQuery,
  useGetPendingLeavesQuery,
  useGetLeaveAnalyticsQuery,
  useGetTodayLeavesQuery,
  useGetLeavesByDateRangeQuery,
  useUpdateLeaveMutation,
  useApproveLeaveMutation,
  useDeleteLeaveMutation,
  useGetEmployeeNamesQuery,

  // Holidays
  useGetHolidaysQuery,
  useCreateHolidayMutation,
  useUpdateHolidayMutation,
  useDeleteHolidayMutation,

  // Grievances
  useGetGrievanceMetaQuery,
  useGetGrievancesQuery,
  useGetGrievanceSummaryQuery,
  useGetGrievanceQuery,
  useCreateGrievanceMutation,
  useUpdateGrievanceStatusMutation,
} = api;
