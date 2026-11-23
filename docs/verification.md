# Weryfikacja 0.1 — 14 listopada 2026

Polecenie `node scripts/verify.mjs` zakończyło się kodem 0. TypeScript API i frontendu: OK. Node test runner: 14/14, w tym test nadrzędny i 13 scenariuszy SQL/HTTP. Po rozdzieleniu komponentu App od punktu wejścia powtórzono kontrolę TypeScript i build frontendu: OK, 1581 modułów, JS ok. 248 kB (77,5 kB gzip). Baza testów: oddzielna instancja PGlite; dane lokalnego podglądu pozostały niezależne.

Testy obejmują zgodność 102 kolumn z modelem PW-20, migracje i checksum, ponawialny seed, ograniczenia SQL, haszowanie haseł, sesje, agregaty, role i izolację pracownika, walidację parametrów, konflikt numeru zlecenia, odrzucenie zapisu z obcego Origin oraz wycofanie transakcji po błędzie audytu. Przypadek `priority: null` jest odrzucany jako błędne żądanie.

W przeglądarce sprawdzono logowanie kierownika, odczyt panelu i zadań, utworzenie zlecenia `PF-DEMO-UI` z potwierdzeniem zapisu, wylogowanie, logowanie pracownika i odczyt trzech własnych zadań oraz jednej obecności. Fikcyjne zlecenie kontrolne pozostało w lokalnej demonstracji. Dane i sesja zachowały się po ponownym uruchomieniu backendu.

Sprawdzono układ desktopowy i mobilny (viewport 390 × 844), dostępność wylogowania na telefonie i brak poziomego przepełnienia całej strony. Szerokie tabele przewijają się we własnym kontenerze. Zrzuty znajdują się w `screenshots/`.

Nie uruchamiano CI na GitHubie ani wdrożenia. Nie wykonano testów na docelowym serwerze PostgreSQL, obciążenia, wielu procesów ani urządzenia z kamerą. Lokalny Docker Desktop nie uruchomił demona. Funkcje rejestracji czasu, korekt i QR nadal są poza wykonanym szkieletem.
