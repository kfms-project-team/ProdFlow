const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ROOT, openDatabase, migrate, verifyPassword } = require('@prodflow/database');
const { seed } = require('../../../packages/database/seed.cjs');
const password = 'OnlyForAutomatedTests-4821';

test('PW-20 schema, database invariants and HTTP permissions', async (t) => {
  await fs.mkdir(path.join(ROOT, 'tmp'), { recursive: true });
  const directory = await fs.mkdtemp(path.join(ROOT, 'tmp', 'integration-'));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_DRIVER = 'pglite';
  process.env.PGLITE_DIR = directory;
  process.env.WEB_ORIGIN = 'http://localhost:5173';
  let db = await openDatabase();
  let app;
  try {
    await t.test('migrations apply once and detect changed historical SQL', async () => {
      assert.equal((await migrate(db)).length, 2);
      assert.deepEqual(await migrate(db), []);
      const old = (await db.query('SELECT name, checksum FROM schema_migrations ORDER BY name'))
        .rows[0];
      await db.query('UPDATE schema_migrations SET checksum=$1 WHERE name=$2', [
        '0'.repeat(64),
        old.name,
      ]);
      await assert.rejects(migrate(db), /checksum mismatch/);
      await db.query('UPDATE schema_migrations SET checksum=$1 WHERE name=$2', [
        old.checksum,
        old.name,
      ]);
    });
    await t.test(
      'all original columns retain PW-20 types, lengths, nullability and identity',
      async () => {
        const model = JSON.parse(
          await fs.readFile(path.join(ROOT, 'docs/sources/PW-20-test_db.pgerd'), 'utf8'),
        );
        const tables = model.data.layers
          .flatMap((layer) => Object.values(layer.models || {}))
          .filter((node) => node.type === 'table')
          .map((node) => node.otherInfo.data);
        assert.equal(tables.length, 12);
        const columns = (
          await db.query(
            "SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,is_identity FROM information_schema.columns WHERE table_schema='public'",
          )
        ).rows;
        for (const table of tables)
          for (const column of table.columns) {
            const actual = columns.find(
              (c) => c.table_name === table.name && c.column_name === column.name,
            );
            const name = `${table.name}.${column.name}`;
            assert.ok(actual, name);
            assert.equal(actual.data_type, column.typname, name + ' type');
            assert.equal(
              actual.is_nullable,
              column.attnotnull ? 'NO' : 'YES',
              name + ' nullability',
            );
            if (column.attlen)
              assert.equal(
                actual.character_maximum_length,
                Number(column.attlen),
                name + ' length',
              );
            if (column.attidentity) assert.equal(actual.is_identity, 'YES', name + ' identity');
          }
      },
    );
    await t.test('demo seed is repeatable and passwords are hashed', async () => {
      assert.deepEqual(await seed(db, password), { skipped: false });
      assert.deepEqual(await seed(db, password), { skipped: true });
      const users = (await db.query('SELECT password FROM accounts_user')).rows;
      assert.equal(users.length, 2);
      assert.notEqual(users[0].password, password);
      assert.equal(await verifyPassword(password, users[0].password), true);
      assert.equal(await verifyPassword('incorrect', users[0].password), false);
    });
    const values = (
      await db.query(`SELECT a.employee_id,a.id AS attendance_id,w.task_id,w.started_qr_point_id,
      t.project_id,t.workstation_id,p.created_by_id FROM attendance_records a
      JOIN work_sessions w ON w.attendance_id=a.id JOIN tasks t ON t.id=w.task_id
      JOIN projects p ON p.id=t.project_id LIMIT 1`)
    ).rows[0];
    const rejectsCode = (sql, args, code) =>
      assert.rejects(db.query(sql, args), (error) => error.code === code);
    await t.test(
      'only one open attendance, work interval, break and active assignment',
      async () => {
        await rejectsCode(
          'INSERT INTO attendance_records(employee_id,check_in_at) VALUES ($1,now())',
          [values.employee_id],
          '23505',
        );
        await rejectsCode(
          'INSERT INTO work_sessions(employee_id,task_id,started_qr_point_id,attendance_id,started_at) VALUES ($1,$2,$3,$4,now())',
          [values.employee_id, values.task_id, values.started_qr_point_id, values.attendance_id],
          '23505',
        );
        const args = [values.attendance_id];
        await db.query(
          "INSERT INTO attendance_breaks(attendance_id,break_type,started_at) VALUES ($1,'short',now())",
          args,
        );
        await rejectsCode(
          "INSERT INTO attendance_breaks(attendance_id,break_type,started_at) VALUES ($1,'meal',now())",
          args,
          '23505',
        );
        await db.query(
          'DELETE FROM attendance_breaks WHERE ended_at IS NULL AND attendance_id=$1',
          args,
        );
        await rejectsCode(
          'INSERT INTO task_assignments(task_id,employee_id,assigned_by_id) VALUES ($1,$2,$3)',
          [values.task_id, values.employee_id, values.created_by_id],
          '23505',
        );
      },
    );
    await t.test(
      'invalid dates, quantities, QR kinds and missing correction reasons fail',
      async () => {
        await rejectsCode(
          'UPDATE attendance_records SET check_out_at=check_in_at WHERE id=$1',
          [values.attendance_id],
          '23514',
        );
        await rejectsCode(
          'UPDATE tasks SET planned_minutes=-1 WHERE id=$1',
          [values.task_id],
          '23514',
        );
        await rejectsCode(
          "INSERT INTO qr_points(point_type,name) VALUES ('workstation','invalid')",
          [],
          '23514',
        );
        await rejectsCode(
          "INSERT INTO audit_logs(action,entity_type,entity_id) VALUES ('attendance.correct','attendance',$1)",
          [values.attendance_id],
          '23514',
        );
        await rejectsCode(
          'UPDATE work_sessions SET completed_units=-1 WHERE task_id=$1',
          [values.task_id],
          '23514',
        );
        await rejectsCode(
          'UPDATE work_sessions SET end_reason=NULL WHERE ended_at IS NOT NULL',
          [],
          '23514',
        );
        await rejectsCode(
          "INSERT INTO tasks(project_id,workstation_id,name,sequence_no) VALUES ($1,$2,'duplicate',1)",
          [values.project_id, values.workstation_id],
          '23505',
        );
      },
    );
    await t.test('work interval cannot point to another employee attendance', async () => {
      const u = (
        await db.query(
          "INSERT INTO accounts_user(username,password,first_name,last_name) VALUES ('other','unused','Other','Person') RETURNING id",
        )
      ).rows[0].id;
      const e = (
        await db.query(
          "INSERT INTO employees(user_id,employee_number) VALUES ($1,'TEST-OTHER') RETURNING id",
          [u],
        )
      ).rows[0].id;
      const a = (
        await db.query(
          'INSERT INTO attendance_records(employee_id,check_in_at) VALUES ($1,now()) RETURNING id',
          [e],
        )
      ).rows[0].id;
      await rejectsCode(
        "INSERT INTO work_sessions(employee_id,task_id,started_qr_point_id,attendance_id,started_at,ended_at,end_reason) VALUES ($1,$2,$3,$4,now()-interval '2 hours',now()-interval '1 hour','other')",
        [values.employee_id, values.task_id, values.started_qr_point_id, a],
        '23503',
      );
      // A private task and another assignee expose accidental cross-employee data leakage.
      const otherTask = (
        await db.query(
          "INSERT INTO tasks(project_id,workstation_id,name,sequence_no) VALUES ($1,$2,'Private task',4) RETURNING id",
          [values.project_id, values.workstation_id],
        )
      ).rows[0].id;
      await db.query(
        'INSERT INTO task_assignments(task_id,employee_id,assigned_by_id) VALUES ($1,$2,$3),($4,$2,$3)',
        [otherTask, e, values.created_by_id, values.task_id],
      );
    });
    await db.close();
    db = null;
    const { createApp } = require('../dist/bootstrap.js');
    const { DatabaseService } = require('../dist/database/database.module.js');
    app = await createApp(false);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const request = (
      route,
      { method = 'GET', body, cookie, origin = process.env.WEB_ORIGIN } = {},
    ) =>
      fetch(base + '/api/v1' + route, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(origin ? { Origin: origin } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    let managerCookie, workerCookie;
    await t.test('API readiness and anonymous protection', async () => {
      assert.equal((await request('/health/ready')).status, 200);
      assert.equal((await request('/projects')).status, 401);
      assert.equal((await request('/me')).status, 401);
    });
    await t.test('login rejects wrong passwords and stores only token hashes', async () => {
      assert.equal(
        (
          await request('/auth/login', {
            method: 'POST',
            body: { username: 'kierownik', password: 'bad' },
          })
        ).status,
        401,
      );
      const login = await request('/auth/login', {
        method: 'POST',
        body: { username: 'kierownik', password },
      });
      assert.equal(login.status, 201);
      const cookie = login.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Strict/i);
      assert.match(cookie, /Path=\/api/);
      managerCookie = cookie.split(';')[0];
      const token = managerCookie.split('=')[1];
      const hashes = (await app.get(DatabaseService).query('SELECT token_hash FROM auth_sessions'))
        .rows;
      assert.equal(hashes[0].token_hash, createHash('sha256').update(token).digest('hex'));
      const user = await (await request('/me', { cookie: managerCookie })).json();
      assert.equal(user.role, 'manager');
      assert.equal(user.password, undefined);
    });
    await t.test('dashboard aggregates work without multiplying by assignments', async () => {
      const dashboard = await (await request('/dashboard', { cookie: managerCookie })).json();
      assert.equal(dashboard.plannedMinutes, 420);
      assert.ok(dashboard.actualMinutes >= 210 && dashboard.actualMinutes < 212);
      const projects = await (await request('/projects', { cookie: managerCookie })).json();
      const project = projects.find((p) => p.project_number === 'PF-2026-001');
      assert.equal(project.planned_minutes, 420);
      assert.equal(project.completed_count, 1);
      assert.ok(project.actual_minutes >= 210 && project.actual_minutes < 212);
    });
    await t.test(
      'project creation validates input, uniqueness and transactional audit',
      async () => {
        const options = {
          method: 'POST',
          cookie: managerCookie,
          body: { projectNumber: 'TEST-001', name: 'Test project', priority: 'high' },
        };
        const created = await request('/projects', options);
        assert.equal(created.status, 201);
        const data = await created.json();
        assert.equal(data.status, 'draft');
        assert.equal((await request('/projects', options)).status, 409);
        assert.equal(
          (await request('/projects', { ...options, body: { ...options.body, name: '   ' } }))
            .status,
          400,
        );
        assert.equal(
          (await request('/projects', { ...options, body: { ...options.body, role: 'admin' } }))
            .status,
          400,
        );
        assert.equal(
          (await request('/projects', { ...options, body: { ...options.body, priority: null } }))
            .status,
          400,
        );
        assert.equal((await request('/projects?limit=500', { cookie: managerCookie })).status, 400);
        const logs = (
          await app
            .get(DatabaseService)
            .query("SELECT * FROM audit_logs WHERE action='project.create' AND entity_id=$1", [
              data.id,
            ])
        ).rows;
        assert.equal(logs.length, 1);
        assert.equal(logs[0].new_data.project_number, 'TEST-001');
        // Force an audit failure and prove that the project insert is rolled back.
        const { ProjectsService } = require('../dist/projects/projects.module.js');
        const database = app.get(DatabaseService);
        const failingDb = {
          transaction: (fn) =>
            database.transaction((tx) =>
              fn({
                query: (sql, args) =>
                  sql.startsWith('INSERT INTO audit_logs')
                    ? Promise.reject(new Error('audit unavailable'))
                    : tx.query(sql, args),
              }),
            ),
        };
        await assert.rejects(
          new ProjectsService(failingDb).create(
            { projectNumber: 'ROLLBACK', name: 'Rollback', priority: 'normal' },
            String(values.created_by_id),
          ),
          /audit unavailable/,
        );
        assert.equal(
          (await database.query("SELECT id FROM projects WHERE project_number='ROLLBACK'")).rows
            .length,
          0,
        );
      },
    );
    await t.test('mutations require same origin', async () => {
      for (const origin of ['https://untrusted.example', ''])
        assert.equal(
          (
            await request('/projects', {
              method: 'POST',
              origin,
              cookie: managerCookie,
              body: { projectNumber: 'CSRF', name: 'Bad' },
            })
          ).status,
          403,
        );
    });
    await t.test('worker can only read own assigned tasks and own attendance', async () => {
      const login = await request('/auth/login', {
        method: 'POST',
        body: { username: 'pracownik', password },
      });
      assert.equal(login.status, 201);
      workerCookie = login.headers.get('set-cookie').split(';')[0];
      for (const route of ['/projects', '/dashboard'])
        assert.equal((await request(route, { cookie: workerCookie })).status, 403);
      assert.equal(
        (
          await request('/projects', {
            method: 'POST',
            cookie: workerCookie,
            body: { projectNumber: 'NO', name: 'Denied' },
          })
        ).status,
        403,
      );
      const tasks = await (await request('/tasks', { cookie: workerCookie })).json();
      assert.equal(tasks.length, 3);
      assert.ok(tasks.every((row) => !row.assignees.includes('Other')));
      const rows = await (await request('/attendance', { cookie: workerCookie })).json();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].employee_number, 'DEMO-001');
    });
    await t.test('deactivated employee and logged-out tokens immediately lose access', async () => {
      await app
        .get(DatabaseService)
        .query('UPDATE employees SET is_active=false WHERE id=$1', [values.employee_id]);
      assert.equal((await request('/me', { cookie: workerCookie })).status, 401);
      assert.equal(
        (await request('/auth/logout', { method: 'POST', cookie: managerCookie })).status,
        201,
      );
      assert.equal((await request('/me', { cookie: managerCookie })).status, 401);
    });
  } finally {
    if (app) await app.close();
    if (db) await db.close();
    // Only remove this test's uniquely-created directory, after both DB handles closed.
    assert.ok(directory.startsWith(path.join(ROOT, 'tmp', 'integration-')));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
