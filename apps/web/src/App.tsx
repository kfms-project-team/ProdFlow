import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  Factory,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { Attendance, CurrentUser, Dashboard, Project, Task } from '@prodflow/contracts';
import { api, ApiFailure } from './api';
import './styles.css';
import { ModalFrame } from './ModalFrame';

type Page = 'dashboard' | 'projects' | 'tasks' | 'attendance' | 'terminal';
const labels: Record<Page, string> = {
  dashboard: 'Przegląd zakładu',
  projects: 'Zlecenia',
  tasks: 'Zadania',
  attendance: 'Obecności',
  terminal: 'Terminal QR',
};
const navItems = [
  { id: 'dashboard' as Page, label: 'Przegląd', Icon: LayoutDashboard },
  { id: 'projects' as Page, label: 'Zlecenia', Icon: FolderKanban },
  { id: 'tasks' as Page, label: 'Zadania', Icon: ClipboardList },
  { id: 'attendance' as Page, label: 'Obecności', Icon: Users },
  { id: 'terminal' as Page, label: 'Terminal QR', Icon: QrCode },
];
const statusLabels: Record<string, string> = {
  draft: 'Szkic',
  planned: 'Zaplanowane',
  in_progress: 'W realizacji',
  on_hold: 'Wstrzymane',
  completed: 'Zakończone',
  cancelled: 'Anulowane',
  blocked: 'Zablokowane',
};
const priorityLabels: Record<string, string> = {
  low: 'Niski',
  normal: 'Normalny',
  high: 'Wysoki',
  urgent: 'Pilny',
};
const minutes = (value: number) => `${Math.floor(value / 60)} h ${value % 60} min`;
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(value))
    : 'Bez terminu';
const clock = (value: string) =>
  new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Warsaw',
  }).format(new Date(value));
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Factory size={21} />
      </span>
      <span>
        Prod<span className="brand-light">Flow</span>
        <small>PRODUKCJA POD KONTROLĄ</small>
      </span>
    </div>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {statusLabels[status] || status}
    </span>
  );
}
function ErrorBox({ text }: { text: string }) {
  return (
    <div className="error" role="alert">
      {text}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <ClipboardList size={28} />
      <p>{text}</p>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (u: CurrentUser) => void }) {
  const [username, setUsername] = useState('kierownik');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      onLogin(await api<CurrentUser>('/me'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-shell">
      <section className="login-story">
        <Brand />
        <div className="story-body">
          <span className="eyebrow">JEDEN SYSTEM. CAŁY ZAKŁAD.</span>
          <h1>
            Dobry plan.
            <br />
            Sprawna praca.
            <br />
            <em>Widoczne efekty.</em>
          </h1>
          <p>
            Od pierwszego przydziału do ostatniej sztuki. Miej zlecenia, obecności i czas pracy w
            jednym miejscu.
          </p>
          <div className="story-steps">
            <span>01 / ZAPLANUJ</span>
            <ArrowRight size={18} />
            <span>02 / REALIZUJ</span>
            <ArrowRight size={18} />
            <span>03 / SPRAWDŹ</span>
          </div>
        </div>
        <div className="story-footer">
          <span>ProdFlow / 0.1</span>
          <span>Środowisko demonstracyjne</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-mark">
            <ShieldCheck size={28} />
          </div>
          <span className="eyebrow">WITAJ W PRODFLOW</span>
          <h2>Zaloguj się do zakładu</h2>
          <p className="muted">Twój plan pracy zaczyna się tutaj.</p>
          <form onSubmit={submit}>
            <label>
              Login
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                maxLength={150}
              />
            </label>
            <label>
              Hasło
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={256}
              />
            </label>
            {error && <ErrorBox text={error} />}
            <button className="primary wide" disabled={busy}>
              {busy ? 'Logowanie…' : 'Zaloguj się'}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="demo-note">
            Konta demonstracyjne: <strong>kierownik</strong> i <strong>pracownik</strong>. Hasło
            znajdziesz w lokalnej konfiguracji projektu.
          </p>
        </div>
      </section>
    </div>
  );
}

function ProjectTable({
  projects,
  onOpen,
}: {
  projects: Project[];
  onOpen?: (p: Project) => void;
}) {
  if (!projects.length) return <Empty text="Brak zleceń spełniających kryteria." />;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Zlecenie / klient</th>
            <th>Status</th>
            <th>Postęp</th>
            <th>Termin</th>
            <th>Priorytet</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const percent = p.task_count ? Math.round((p.completed_count / p.task_count) * 100) : 0;
            return (
              <tr key={p.id}>
                <td>
                  <button className="project-name" onClick={() => onOpen?.(p)}>
                    {p.name}
                    <ArrowUpRight size={15} />
                  </button>
                  <small>
                    {p.project_number} · {p.customer_name || 'Bez klienta'}
                  </small>
                </td>
                <td>
                  <Badge status={p.status} />
                </td>
                <td>
                  <div className="progress-label">
                    <span>
                      {p.completed_count}/{p.task_count} zadań
                    </span>
                    <b>{p.task_count ? `${percent}%` : '—'}</b>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </td>
                <td className="nowrap">{date(p.due_date)}</td>
                <td>
                  <span className={`priority priority-${p.priority}`}>
                    <i />
                    {priorityLabels[p.priority]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function ProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/projects', {
        method: 'POST',
        body: JSON.stringify({ projectNumber: number, name, description, priority }),
      });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <ModalFrame label="new-title" onClose={onClose} busy={busy}>
      <div className="modal-heading">
        <div>
          <span className="eyebrow">NOWA PRACA</span>
          <h2 id="new-title">Utwórz zlecenie</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Zamknij formularz"
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </div>
      <form onSubmit={submit}>
        <label>
          Numer zlecenia
          <input
            required
            pattern="[A-Za-z0-9_-]+"
            maxLength={30}
            placeholder="np. PF-2026-003"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>
        <label>
          Nazwa
          <input
            required
            maxLength={150}
            placeholder="Co produkujemy?"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Opis
          <textarea
            rows={3}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Priorytet
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(priorityLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {error && <ErrorBox text={error} />}
        <p className="muted small">
          Zlecenie zostanie zapisane jako szkic. Numer musi być unikalny.
        </p>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            Anuluj
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Utwórz zlecenie'}
            <Plus size={17} />
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function Workspace({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const worker = user.role === 'worker';
  const [page, setPage] = useState<Page>(worker ? 'tasks' : 'dashboard');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<Date | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Project | null>(null);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (page === 'dashboard') {
        const [d, t] = await Promise.all([
          api<Dashboard>('/dashboard'),
          api<Task[]>('/tasks?limit=100'),
        ]);
        setDashboard(d);
        setTasks(t);
      }
      if (page === 'projects') setProjects(await api<Project[]>('/projects?limit=100'));
      if (page === 'tasks') setTasks(await api<Task[]>('/tasks?limit=100'));
      if (page === 'attendance') setAttendance(await api<Attendance[]>('/attendance?limit=100'));
      if (page === 'terminal') await api('/health/ready');
      setUpdated(new Date());
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 401) {
        onLogout();
        return;
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [page, onLogout]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  function navigate(p: Page) {
    setPage(p);
    setQuery('');
    setNotice('');
    setSelected(null);
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      onLogout();
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 401) onLogout();
      else setError((e as Error).message);
    }
  }
  const filtered = projects.filter((p) =>
    `${p.name} ${p.project_number} ${p.customer_name || ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="site-select">
          <span className="site-icon">
            <Factory size={18} />
          </span>
          <div>
            <strong>Zakład demonstracyjny</strong>
            <small>Środowisko lokalne</small>
          </div>
        </div>
        <span className="nav-caption">PRZESTRZEŃ ROBOCZA</span>
        <nav aria-label="Nawigacja główna">
          {navItems
            .filter((n) => !worker || !['dashboard', 'projects'].includes(n.id))
            .map(({ id, label, Icon }) => (
              <button
                key={id}
                className={page === id ? 'nav-item active' : 'nav-item'}
                onClick={() => navigate(id)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {page === id && <ChevronRight size={15} />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="release">
            <span className="release-dot" />
            Wersja 0.1 — szkielet aplikacji
          </div>
          <div className="profile">
            <div className="avatar">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div>
              <strong>
                {user.firstName} {user.lastName}
              </strong>
              <small>{worker ? 'Pracownik' : 'Kierownik / administrator'}</small>
            </div>
            <button
              className="logout"
              aria-label="Wyloguj się"
              title="Wyloguj się"
              onClick={() => void logout()}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs">
            Zakład <ChevronRight size={14} />
            <strong>{labels[page]}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="mobile-logout icon-button"
              aria-label="Wyloguj się"
              onClick={() => void logout()}
            >
              <LogOut size={18} />
            </button>
            <span className="demo-tag">DEMO</span>
            <span className="topbar-date">
              {new Intl.DateTimeFormat('pl-PL', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(new Date())}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {worker ? 'TWOJA PRZESTRZEŃ PRACY' : 'CENTRUM PRODUKCJI'}
              </span>
              <h1>{labels[page]}</h1>
              <p>
                {page === 'dashboard'
                  ? 'Wszystko, co warto wiedzieć o pracy Twojego zakładu.'
                  : page === 'tasks'
                    ? 'Przydziały, stanowiska i rzeczywisty czas realizacji.'
                    : page === 'attendance'
                      ? 'Obecność w zakładzie, niezależnie od czasu wykonywania zadań.'
                      : page === 'projects'
                        ? 'Od planu do gotowego produktu. Wszystkie zlecenia w jednym miejscu.'
                        : 'Przygotowanie mechanizmu rejestracji pracy.'}
              </p>
            </div>
            <div className="heading-actions">
              <button className="secondary" disabled={busy} onClick={() => void refresh()}>
                <RefreshCw size={16} className={busy ? 'spin' : ''} />
                Odśwież
              </button>
              {!worker && ['dashboard', 'projects'].includes(page) && (
                <button className="primary" onClick={() => setCreating(true)}>
                  <Plus size={17} />
                  Nowe zlecenie
                </button>
              )}
            </div>
          </div>
          {notice && (
            <div className="success" role="status">
              <Check size={18} />
              {notice}
            </div>
          )}
          {error && <ErrorBox text={error} />}
          <div className="data-caption" aria-live="polite">
            <span className={`connection-dot ${error ? 'offline' : ''}`} />
            {busy
              ? 'Pobieranie danych…'
              : error
                ? 'Nie udało się odświeżyć danych'
                : updated
                  ? `Dane z bazy · odświeżono ${updated.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Łączenie z serwerem'}
          </div>
          {page === 'dashboard' && dashboard && (
            <>
              <section className="stats">
                <div className="stat-card">
                  <div className="stat-label">
                    Aktywne zlecenia
                    <FolderKanban size={20} />
                  </div>
                  <strong>{dashboard.activeProjects.toString().padStart(2, '0')}</strong>
                  <span>zaplanowane i w realizacji</span>
                </div>
                <div className="stat-card">
                  <div className="stat-label">
                    Obecni pracownicy
                    <Users size={20} />
                  </div>
                  <strong>{dashboard.presentEmployees.toString().padStart(2, '0')}</strong>
                  <span>otwarte wpisy obecności</span>
                </div>
                <div className="stat-card accent">
                  <div className="stat-label">
                    Zadania w toku
                    <Activity size={20} />
                  </div>
                  <strong>{dashboard.activeTasks.toString().padStart(2, '0')}</strong>
                  <span>z aktywną sesją pracy</span>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Aktualne zlecenia</h2>
                    <p>Postęp realizacji na podstawie ukończonych zadań.</p>
                  </div>
                  <button className="text-button" onClick={() => navigate('projects')}>
                    Wszystkie zlecenia
                    <ArrowRight size={16} />
                  </button>
                </div>
                <ProjectTable projects={dashboard.projects} onOpen={setSelected} />
              </section>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Plan pracy</h2>
                      <p>Najbliższe etapy produkcji</p>
                    </div>
                    <ClipboardList size={20} />
                  </div>
                  <div className="task-list">
                    {tasks.slice(0, 4).map((t, i) => (
                      <button className="task-row" key={t.id} onClick={() => navigate('tasks')}>
                        <span className={`step ${t.status === 'completed' ? 'done' : ''}`}>
                          {t.status === 'completed' ? (
                            <Check size={16} />
                          ) : (
                            String(i + 1).padStart(2, '0')
                          )}
                        </span>
                        <span>
                          <strong>{t.name}</strong>
                          <small>
                            {t.project_number} · {t.workstation_name}
                          </small>
                        </span>
                        <Badge status={t.status} />
                      </button>
                    ))}
                    {!tasks.length && <Empty text="Nie ma jeszcze zadań." />}
                  </div>
                </section>
                <section className="time-panel">
                  <div className="time-heading">
                    <span className="eyebrow">CZAS REALIZACJI</span>
                    <Clock3 size={22} />
                  </div>
                  <h2>
                    Każda godzina
                    <br />
                    ma znaczenie.
                  </h2>
                  <div className="time-numbers">
                    <div>
                      <span>Rzeczywisty czas pracy</span>
                      <strong>{minutes(dashboard.actualMinutes)}</strong>
                    </div>
                    <div>
                      <span>Plan zadań</span>
                      <strong>{minutes(dashboard.plannedMinutes)}</strong>
                    </div>
                  </div>
                  <p>
                    Suma odcinków pracy nad zadaniami.
                    <br />
                    Obecności i przerwy są liczone osobno.
                  </p>
                </section>
              </div>
            </>
          )}
          {page === 'projects' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  Lista zleceń <span className="count">{filtered.length}</span>
                </h2>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Szukaj zlecenia"
                    placeholder="Szukaj nazwy, numeru lub klienta"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <ProjectTable projects={filtered} onOpen={setSelected} />
              <div className="panel-foot">Widok pierwszych 100 zleceń · najnowsze na górze</div>
            </section>
          )}
          {page === 'tasks' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>{worker ? 'Twoje przydzielone zadania' : 'Zadania produkcyjne'}</h2>
                <span className="count">{tasks.length}</span>
              </div>
              {tasks.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Zadanie</th>
                        <th>Stanowisko</th>
                        <th>Status</th>
                        <th>Plan</th>
                        <th>{worker ? 'Twój czas' : 'Czas pracy'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.name}</strong>
                            <small>
                              {t.project_number} · {t.assignees || 'Nieprzypisane'}
                            </small>
                          </td>
                          <td>{t.workstation_name}</td>
                          <td>
                            <Badge status={t.status} />
                          </td>
                          <td>{minutes(t.planned_minutes)}</td>
                          <td>{minutes(t.actual_minutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty text="Brak przydzielonych zadań." />
              )}
              <div className="panel-foot">
                Podgląd danych. Rejestracja startu, pauzy i zakończenia będzie dodana w kolejnym
                etapie.
              </div>
            </section>
          )}
          {page === 'attendance' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>{worker ? 'Twoja obecność' : 'Obecności zespołu'}</h2>
                <span className="count">{attendance.length}</span>
              </div>
              {attendance.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Pracownik</th>
                        <th>Wejście</th>
                        <th>Wyjście</th>
                        <th>Stan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <strong>{a.employee_name}</strong>
                            <small>{a.employee_number}</small>
                          </td>
                          <td>{clock(a.check_in_at)}</td>
                          <td>{a.check_out_at ? clock(a.check_out_at) : '—'}</td>
                          <td>
                            <span
                              className={`badge ${a.check_out_at ? 'completed' : a.on_break ? 'on_hold' : 'in_progress'}`}
                            >
                              <i />
                              {a.check_out_at
                                ? 'Zakończona'
                                : a.on_break
                                  ? 'Na przerwie'
                                  : 'Obecny'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty text="Brak wpisów obecności." />
              )}
              <div className="panel-foot">
                Czas wyświetlany w strefie Europe/Warsaw · dane demonstracyjne
              </div>
            </section>
          )}
          {page === 'terminal' && (
            <section className="terminal-placeholder">
              <div className="terminal-symbol">
                <QrCode size={52} />
              </div>
              <span className="eyebrow">KOLEJNY ETAP / PW-12</span>
              <h2>
                Terminal jest przygotowany
                <br />
                do dalszej integracji
              </h2>
              <p>
                Szkielet bazy zawiera punkty QR, terminale i wygasające wyzwania. Wystawianie kodów,
                skanowanie oraz zapis obecności nie są jeszcze aktywne.
              </p>
              <div className="terminal-steps">
                <span>
                  <Check size={16} /> Model danych
                </span>
                <span>
                  <Clock3 size={16} /> API operacji
                </span>
                <span>
                  <Clock3 size={16} /> Skanowanie PWA
                </span>
              </div>
            </section>
          )}
          <footer className="main-footer">
            <span>
              ProdFlow <b>0.1</b> · dane demonstracyjne
            </span>
            <a href="/api/docs" target="_blank" rel="noreferrer">
              Dokumentacja API
              <ArrowUpRight size={13} />
            </a>
          </footer>
        </main>
      </div>
      {creating && (
        <ProjectDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setNotice('Zlecenie zostało zapisane.');
            void refresh();
          }}
        />
      )}
      {selected && (
        <ModalFrame label="detail-title" onClose={() => setSelected(null)}>
          <div className="modal-heading">
            <span className="eyebrow">{selected.project_number}</span>
            <button
              className="icon-button"
              aria-label="Zamknij szczegóły"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
          </div>
          <h2 id="detail-title">{selected.name}</h2>
          <Badge status={selected.status} />
          <p>{selected.description || 'Brak dodatkowego opisu.'}</p>
          <dl className="detail-grid">
            <dt>Klient</dt>
            <dd>{selected.customer_name || 'Nie wskazano'}</dd>
            <dt>Plan pracy</dt>
            <dd>{minutes(selected.planned_minutes)}</dd>
            <dt>Zarejestrowany czas</dt>
            <dd>{minutes(selected.actual_minutes)}</dd>
            <dt>Ukończone zadania</dt>
            <dd>
              {selected.completed_count} / {selected.task_count}
            </dd>
          </dl>
          <button className="primary wide" onClick={() => setSelected(null)}>
            Zamknij szczegóły
          </button>
        </ModalFrame>
      )}
    </div>
  );
}
// Keep the React Refresh boundary separate from the one-time createRoot entry point.
export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);
  const reset = useCallback(() => setUser(null), []);
  useEffect(() => {
    api<CurrentUser>('/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  if (checking)
    return (
      <div className="loading">
        <Factory size={30} />
        <p>Otwieranie ProdFlow…</p>
      </div>
    );
  return user ? <Workspace user={user} onLogout={reset} /> : <Login onLogin={setUser} />;
}
