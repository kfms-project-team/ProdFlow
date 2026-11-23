export interface SqlClient {
  query<T = any>(sql: string, args?: any[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<any>;
}
export interface Database extends SqlClient {
  driver: string;
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export const ROOT: string;
export function openDatabase(options?: { driver?: string; memory?: boolean }): Promise<Database>;
export function migrate(db: Database): Promise<string[]>;
export function hashPassword(password: string): Promise<string>;
export function verifyPassword(password: string, encoded: string): Promise<boolean>;
