# PW-20 — przegląd modelu bazy ProdFlow

Data: 14 listopada 2026. Zakres: załączniki `test_db.pgerd` i `db_opis.pdf` pobrane z PW-20, zestawione z opisem całego systemu. To przegląd projektu i lokalnej rekonstrukcji, nie audyt działającego serwera ani rzeczywistych danych. Oryginały zachowano w `sources/`.

## Wniosek

Model nadaje się jako baza MVP. Ma 12 tabel, 102 kolumny i 17 kluczy obcych. Rozdziela konta, pracowników, zlecenia, zadania, przydziały, obecności, przerwy i pracę nad zadaniem. Zachowuję tę strukturę, nazwy tabel oraz historię zakończonych wpisów. Nie ma potrzeby projektowania bazy od zera.

Plik `.pgerd` opisuje kolumny, PK, UNIQUE i FK. Nie zawiera pełnych definicji CHECK i indeksów częściowych. PDF je opisuje; ich brak w eksporcie diagramu nie dowodzi braku w bazie źródłowej. Migracja `001_pw20_baseline.sql` odtwarza model z obu źródeł. Nie jest zrzutem pg_dump.

| Obszar                        | Ocena                                                                            | Działanie w szkielecie                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Obecność a praca              | Poprawne oddzielenie czasu w zakładzie od czasu zadania                          | Oddzielne odczyty i agregaty; nie sumujemy obecności jako pracy                                               |
| Historia i czas               | TIMESTAMPTZ, zakończenie wpisów, ograniczenia chronologii                        | Zachowane; prezentacja obecności w Europe/Warsaw                                                              |
| Aktywne wpisy                 | PDF przewiduje częściowe UNIQUE dla obecności, przerwy, pracy i przydziału       | Odtworzone i sprawdzone próbami niepoprawnego INSERT                                                          |
| Role i zespoły                | `is_staff` / `is_superuser` nie opisują wprost uprawnień produktu; brak zespołów | Osobne `role` i `teams`; API opiera autoryzację na `role`                                                     |
| Powiązanie pracy z obecnością | `work_sessions` ma pracownika, zadanie i QR, bez jawnego rekordu obecności       | `attendance_id` i złożony FK wymuszają tego samego pracownika                                                 |
| Ilość wykonana                | Brak liczby sztuk                                                                | `completed_units >= 0`; zapis ilości przez operacje pozostaje do wykonania                                    |
| QR                            | Stały UUID punktu identyfikuje miejsce, nie zapewnia świeżości skanu             | Tabele `terminals` i `qr_challenges` z hashem tokenu i terminem ważności; API skanowania jeszcze nie istnieje |
| Ponowienia z telefonu         | Brak klucza idempotencji operacji                                                | `operation_receipts` z kluczem użytkownik + UUID; wykorzystanie transakcyjne będzie częścią operacji czasu    |
| Sesje logowania               | Brak tabeli sesji                                                                | `auth_sessions`; w bazie tylko hash tokenu, ważność 8 h                                                       |
| Audyt                         | Jest old/new JSONB i opcjonalny powód                                            | Korekty `*.correct` wymagają powodu; utworzenie zlecenia zapisuje audyt w tej samej transakcji                |
| Aktualizacja czasu zmiany     | Sam DEFAULT nie aktualizuje `updated_at` przy UPDATE                             | Triggery dla projektów, zadań i obecności                                                                     |

## Decyzja dotycząca pauzy

Jeden `work_sessions` oznacza jeden ciągły odcinek pracy. Pauza kończy odcinek z powodem `break`; wznowienie tworzy kolejny wiersz. Analogicznie działa zmiana zadania i koniec zmiany. Czas zadania to suma odcinków, a nie różnica między pierwszym startem a ostatnim końcem.

Jest to doprecyzowanie wcześniejszej ogólnej koncepcji sesji z PW-17 po zapoznaniu się z PW-20. Nie dokładam drugiej tabeli odcinków przechowującej te same informacje. `attendance_breaks` nadal opisuje przerwę w obrębie obecności.

## Reguły wymagane przed uruchomieniem operacji czasu

1. Każda operacja w transakcji, z blokadą rekordu pracownika/obecności. Sprawdzić aktywne konto, zatrudnienie, przydział, zadanie i stanowisko.
2. Jeden otwarty odcinek pracy na pracownika. Start wykluczony podczas przerwy i bez otwartej obecności.
3. Odcinki pracy i przerwy mieszczą się w granicach obecności. Korekty nie mogą nakładać zamkniętych przedziałów. Obecne CHECK i częściowe indeksy nie wystarczają do wymuszenia tych reguł.
4. Wyjście zamyka aktywną pracę i przerwę atomowo. Zmiana zadania zamyka poprzedni odcinek.
5. Serwer wyznacza czas, weryfikuje terminal, aktywny punkt, wygasanie wyzwania i dopasowanie stanowiska do zadania. UUID punktu nie jest sekretem.
6. Wynik zapisu i `operation_receipts` powstają w tej samej transakcji. Ten sam identyfikator z innym hashem żądania daje konflikt. Ten sam skan terminala może obsłużyć wielu pracowników; wyzwanie nie powinno być globalnie jednorazowe.
7. Korekta wymaga roli kierownika, uzasadnienia, wersji wpisu i audytu before/after. `version` jest przygotowane, ale endpoint korekt jeszcze go nie używa.

## Zgodność i ograniczenia migracji

Automatyczny test porównuje 102 oryginalne kolumny z `.pgerd`: obecność, typ, długość, NULL/NOT NULL i identity. Dodatkowe testy weryfikują zachowanie wybranych FK, CHECK oraz wszystkich czterech częściowych indeksów unikalnych. Nie jest to pełny automatyczny diff wszystkich DEFAULT, nazw constraintów, indeksów i polityk istniejącego serwera.

`002_skeleton_extensions.sql` dodaje propozycje dla nowej bazy developerskiej. Nie należy stosować tej pary migracji do istniejącej, zaludnionej bazy: konieczny byłby osobny plan migracji danych, zwłaszcza dla powiązania pracy z obecnością i przypisania ról. Nazwy i układ `accounts_user` przypominają Django; nie zakładam kompatybilności haseł. Nowe konta demo używają scrypt; import wymaga migracji lub adaptera uzgodnionego z autorem logowania.

Schemat nie obejmuje jeszcze pełnych modułów PW-14 (przestoje, dokumenty, jakość). To dalszy zakres produktu. Zespół ma obecnie proste przypisanie 1:N; historia zmian składu i wiele zespołów jednocześnie wymagałyby osobnej tabeli członkostw.

## Wynik lokalnej weryfikacji

Migracje wykonały się na pustej bazie PGlite; ponowne wykonanie nie powieliło schematu ani danych demo. Kompilacja API i produkcyjny build frontendu przeszły. Przeszło 13 scenariuszy SQL/HTTP, w tym test wycofania zlecenia po błędzie zapisu audytu.

Nie zweryfikowano działania na oryginalnej bazie PW-20, serwerze PostgreSQL w Dockerze, współbieżności wielu połączeń ani rzeczywistych danych. Docker Desktop na tej maszynie nie uruchomił demona, dlatego demonstracja działa na PGlite. Przed produkcją wymagane są testy na docelowej wersji PostgreSQL, testy wyścigów oraz odtworzenie backupu.

Źródła: [diagram PW-20](sources/PW-20-test_db.pgerd), [opis bazy PW-20](sources/PW-20-db_opis.pdf), [opis produktu](sources/opis-systemu.txt). Wyjaśnienie mechanizmu: [PostgreSQL — indeksy częściowe](https://www.postgresql.org/docs/current/indexes-partial.html).
