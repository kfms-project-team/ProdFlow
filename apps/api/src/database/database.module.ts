import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Database, openDatabase, SqlClient } from '@prodflow/database';
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db!: Database;
  async onModuleInit() {
    this.db = await openDatabase();
  }
  async onModuleDestroy() {
    await this.db?.close();
  }
  query<T = any>(sql: string, args: any[] = []) {
    return this.db.query<T>(sql, args);
  }
  transaction<T>(fn: (tx: SqlClient) => Promise<T>) {
    return this.db.transaction(fn);
  }
}
@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
