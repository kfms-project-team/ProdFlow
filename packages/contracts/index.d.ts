export type Role = 'worker' | 'manager' | 'admin';
export interface CurrentUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: Role;
  employeeId: string | null;
}
export interface Project {
  id: string;
  project_number: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  customer_name: string | null;
  task_count: number;
  completed_count: number;
  planned_minutes: number;
  actual_minutes: number;
}
export interface Task {
  id: string;
  name: string;
  project_number: string;
  project_name: string;
  workstation_name: string;
  status: string;
  sequence_no: number;
  planned_minutes: number;
  actual_minutes: number;
  assignees: string;
}
export interface Attendance {
  id: string;
  employee_name: string;
  employee_number: string;
  check_in_at: string;
  check_out_at: string | null;
  on_break: boolean;
}
export interface Dashboard {
  activeProjects: number;
  presentEmployees: number;
  activeTasks: number;
  plannedMinutes: number;
  actualMinutes: number;
  projects: Project[];
}
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}
