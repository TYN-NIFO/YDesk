// Navigation and UI capabilities mirror the server's role checks.
export const ROLE_CONFIG = {
  employee: { label: 'Employee', home: '/employee', managePeople: false, manageLeave: false },
  supervisor: { label: 'Supervisor', home: '/employee', managePeople: false, manageLeave: false },
  finance_manager: { label: 'Finance manager', home: '/finance', managePeople: false, manageLeave: false },
  executive: { label: 'Executive', home: '/executive', managePeople: false, manageLeave: true },
  admin: { label: 'Administrator', home: '/admin', managePeople: true, manageLeave: false },
} as const;
export type AppRole = keyof typeof ROLE_CONFIG;
export const roleConfig = (role: string) => ROLE_CONFIG[role as AppRole] || ROLE_CONFIG.employee;
