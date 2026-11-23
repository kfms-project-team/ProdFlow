const { hashPassword } = require('./index.cjs');
async function seed(db, password) {
  if (!password || password === 'CHANGE_ME' || password.length < 12)
    throw new Error('DEMO_PASSWORD must contain at least 12 characters; run setup first.');
  const encoded = await hashPassword(password);
  return db.transaction(async (tx) => {
    const existing = (
      await tx.query("SELECT id FROM accounts_user WHERE username IN ('kierownik','pracownik')")
    ).rows;
    if (existing.length) return { skipped: true };
    const manager = (
      await tx.query(
        "INSERT INTO accounts_user(username,password,first_name,last_name,role) VALUES ('kierownik',$1,'Anna','Kowalska','manager') RETURNING id",
        [encoded],
      )
    ).rows[0].id;
    const worker = (
      await tx.query(
        "INSERT INTO accounts_user(username,password,first_name,last_name,role) VALUES ('pracownik',$1,'Jan','Nowak','worker') RETURNING id",
        [encoded],
      )
    ).rows[0].id;
    const team = (await tx.query("INSERT INTO teams(name) VALUES ('Zespół montażu') RETURNING id"))
      .rows[0].id;
    const emp = (
      await tx.query(
        "INSERT INTO employees(user_id,employee_number,position,team_id) VALUES ($1,'DEMO-001','Monter',$2) RETURNING id",
        [worker, team],
      )
    ).rows[0].id;
    const customer = (
      await tx.query(
        "INSERT INTO customers(name,notes) VALUES ('Baltic Components — DEMO','Fikcyjne dane demonstracyjne') RETURNING id",
      )
    ).rows[0].id;
    const station = (
      await tx.query(
        "INSERT INTO workstations(code,name,location) VALUES ('M-01','Montaż końcowy','Hala A') RETURNING id",
      )
    ).rows[0].id;
    const qr = (
      await tx.query(
        "INSERT INTO qr_points(point_type,name,workstation_id) VALUES ('workstation','Stanowisko M-01',$1) RETURNING id",
        [station],
      )
    ).rows[0].id;
    const entrance = (
      await tx.query(
        "INSERT INTO qr_points(point_type,name) VALUES ('entrance','Wejście główne') RETURNING id",
      )
    ).rows[0].id;
    const project = (
      await tx.query(
        "INSERT INTO projects(project_number,name,description,customer_id,created_by_id,status,priority,due_date) VALUES ('PF-2026-001','100 obudów do urządzeń','Zlecenie demonstracyjne: przygotowanie, montaż i kontrola.', $1,$2,'in_progress','high',CURRENT_DATE+7) RETURNING id",
        [customer, manager],
      )
    ).rows[0].id;
    const taskNames = ['Przygotowanie elementów', 'Montaż obudów', 'Kontrola końcowa'];
    const taskIds = [];
    for (let i = 0; i < 3; i++) {
      const task = (
        await tx.query(
          'INSERT INTO tasks(project_id,workstation_id,name,sequence_no,status,planned_minutes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [
            project,
            station,
            taskNames[i],
            i + 1,
            i === 0 ? 'completed' : i === 1 ? 'in_progress' : 'planned',
            [120, 240, 60][i],
          ],
        )
      ).rows[0].id;
      taskIds.push(task);
      await tx.query(
        "INSERT INTO task_assignments(task_id,employee_id,assigned_by_id,assigned_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP-interval '5 hours')",
        [task, emp, manager],
      );
    }
    const attendance = (
      await tx.query(
        "INSERT INTO attendance_records(employee_id,check_in_at,check_in_qr_point_id) VALUES ($1,CURRENT_TIMESTAMP-interval '4 hours',$2) RETURNING id",
        [emp, entrance],
      )
    ).rows[0].id;
    await tx.query(
      "INSERT INTO work_sessions(employee_id,task_id,started_qr_point_id,attendance_id,started_at,ended_at,end_reason,completed_units) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP-interval '230 minutes',CURRENT_TIMESTAMP-interval '120 minutes','task_completed',100)",
      [emp, taskIds[0], qr, attendance],
    );
    await tx.query(
      "INSERT INTO attendance_breaks(attendance_id,break_type,started_at,ended_at) VALUES ($1,'short',CURRENT_TIMESTAMP-interval '120 minutes',CURRENT_TIMESTAMP-interval '105 minutes')",
      [attendance],
    );
    await tx.query(
      "INSERT INTO work_sessions(employee_id,task_id,started_qr_point_id,attendance_id,started_at) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP-interval '100 minutes')",
      [emp, taskIds[1], qr, attendance],
    );
    await tx.query(
      "UPDATE tasks SET completed_at=CURRENT_TIMESTAMP-interval '120 minutes' WHERE id=$1",
      [taskIds[0]],
    );
    await tx.query(
      "INSERT INTO projects(project_number,name,created_by_id,status,priority,due_date) VALUES ('PF-2026-002','Seria uchwytów montażowych',$1,'planned','normal',CURRENT_DATE+14)",
      [manager],
    );
    return { skipped: false };
  });
}
module.exports = { seed };
