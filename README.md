# ProdFlow 0.1

Uruchamialny szkielet systemu produkcyjnego, oparty na modelu PW-20 i opisie produktu. React + TypeScript + Vite, modułowe API NestJS oraz SQL PostgreSQL. Dane lokalne są fikcyjne.

## Uruchomienie na tym komputerze

Zależności i konfiguracja są już przygotowane. Otwórz `Uruchom-ProdFlow.cmd` albo w katalogu projektu wykonaj:

```sh
node scripts/start-local.mjs
```

Wejdź na **http://localhost:5173**. Konta: `kierownik` i `pracownik`. Wspólne hasło demonstracyjne jest w lokalnym `.env`, w polu `DEMO_PASSWORD`. Konfigurator generuje je losowo; plik nie trafia do repozytorium. Jeśli aplikacja już działa, nie uruchamiaj drugiej instancji. Zatrzymanie: Ctrl+C w terminalu serwera.

Adres `localhost` jest istotny: ochrona zapisu sprawdza zgodność nagłówka Origin z `WEB_ORIGIN`. Otwarcie przez `127.0.0.1` przy domyślnym ustawieniu spowoduje odrzucenie logowania.

API: http://localhost:5173/api/docs, gotowość bazy: http://localhost:5173/api/v1/health/ready.

## Pierwsze uruchomienie na innym komputerze

Wymagane: Node.js 22.12+ i pnpm 11.25.0, zgodnie z `packageManager`. Zależności przypina `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
node scripts/start-local.mjs
```

Skrypt tworzy `.env` tylko wtedy, gdy plik nie istnieje, wykonuje migracje, dodaje demonstrację tylko raz i uruchamia API oraz Vite. Domyślna baza **PGlite** jest lokalnym PostgreSQL w WASM, zapisuje dane w `.data/prodflow` i nie wymaga Dockera. Używaj jednego procesu obsługującego ten katalog; CLI migracji wykonuj przy zatrzymanym API. PGlite służy tutaj do demonstracji i testów. Backend odrzuca konfigurację PGlite w trybie produkcyjnym.

## Co działa

| Obszar              | Stan szkieletu                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Baza                | 12 tabel PW-20 + 5 tabel rozszerzeń; 2 wersjonowane migracje, sumy kontrolne, dane demonstracyjne            |
| Logowanie           | Hasła scrypt, serwerowe sesje 8 h, ciasteczka HttpOnly/SameSite, wylogowanie i unieważnienie po dezaktywacji |
| Uprawnienia         | worker / manager / admin; pracownik widzi własne aktywne przydziały i obecności                              |
| Zlecenia            | Lista, wyszukiwanie pierwszych 100 rekordów, podgląd, tworzenie szkicu z audytem w jednej transakcji         |
| Zadania / obecności | Odczyt z bazy, statusy, plan i czas rzeczywisty                                                              |
| Panel               | Agregaty z bazy: zlecenia, obecni, aktywne zadania, plan i czas pracy                                        |
| Terminal            | Widok informujący o dalszych pracach; przygotowane tabele terminali i wygasających wyzwań                    |
| Interfejs           | Polski, responsywny, z obsługą ładowania, błędów i pustych list                                              |
| Dokumentacja        | OpenAPI/Swagger w środowisku developerskim, raport PW-20 i plan następnego etapu                             |

Manifest aplikacji i ikona są przygotowane. **Nie ma jeszcze skanera, service workera ani obsługi offline.** Nie ma też operacji start/pauza/koniec, edycji przydziałów, korekt czasu, eksportu CSV, zarządzania pracownikami, plików, jakości i przestojów. UI pokazuje ten stan jawnie. Otwarte demonstracyjne odcinki czasu rosną wraz z upływem czasu.

## Weryfikacja

```sh
node scripts/verify.mjs
```

Polecenie kompiluje API i interfejs, buduje frontend oraz uruchamia 13 scenariuszy integracyjnych (Node raportuje 14 testów razem z testem nadrzędnym). Testy działają na osobnej bazie w unikalnym katalogu `tmp/integration-*`, który usuwają po zamknięciu połączeń. Nie modyfikują danych demonstracji.

Sprawdzają: 102 źródłowe kolumny w 12 tabelach, migracje i ich sumy kontrolne, unikalność otwartych wpisów, chronologię, powiązanie sesji z obecnością tego samego pracownika, hasła i sesje, izolację pracowników, role, walidację, duplikaty, ochronę Origin oraz atomowość zapisu z audytem.

Testy lokalne wykonano z PGlite. Serwer PostgreSQL w Dockerze, obciążenie, wyścigi wielu połączeń i wdrożenie produkcyjne wymagają osobnego sprawdzenia. Na tym komputerze Docker nie uruchomił demona.

## Osobny serwer PostgreSQL

Konfiguracja `compose.yaml` uruchamia PostgreSQL 18 z portem związanym wyłącznie z loopbackiem. Po zatrzymaniu lokalnego API ustaw `DATABASE_DRIVER=postgres` w `.env`, sprawdź zgodność `DATABASE_URL` i `POSTGRES_PASSWORD`, następnie:

```sh
docker compose up -d db
node --env-file=.env packages/database/cli.mjs migrate
node --env-file=.env packages/database/cli.mjs seed
node scripts/dev.mjs
```

Ta ścieżka jest przygotowana, ale lokalnie niezweryfikowana z działającym Dockerem. Migracje przeznaczono dla **nowej, pustej bazy ProdFlow**. Nie podłączaj ich do istniejącej bazy PW-20: rozszerzenie obowiązkowego `attendance_id` wymagałoby najpierw uzgodnienia i uzupełnienia danych historycznych. Nie importowano rzeczywistych kont ani haseł.

## Struktura i rozwój

```text
apps/api/src/            auth, projects, tasks, attendance, reporting, database
apps/api/test/           integracja SQL i HTTP
apps/web/src/            interfejs React, klient API, style
packages/contracts/     wspólne typy API
packages/database/      sterowniki PostgreSQL/PGlite, migracje, seed
scripts/                konfigurator, uruchomienie i weryfikacja
docs/PW-20-review.md     ustalenia przeglądu bazy
docs/architecture.md     granice modułów i następny etap
docs/sources/           niezmienione materiały źródłowe
```

Vite odświeża frontend podczas edycji. Po zmianie backendu zatrzymaj i uruchom ponownie `node scripts/dev.mjs`, który kompiluje API. Do wdrożenia trzeba dodać serwowanie `apps/web/dist`, reverse proxy HTTPS, właściwy `WEB_ORIGIN`, PostgreSQL, zarządzanie sekretami, backup/restore i monitoring. Ten etap nie jest wdrożeniem produkcyjnym.

Technologie: [NestJS](https://docs.nestjs.com/first-steps), [Vite](https://vite.dev/guide/), [PGlite](https://pglite.dev/docs/).
