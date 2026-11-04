# DRIFT — wizualizacje dla DJ (hypnotic / deep techno)

Przeglądarkowy VJ tool: shadery WebGL2 reagujące na dźwięk, zegar BPM i autopilot,
który sam zmienia sceny na granicach fraz, a na breakdownach i dropach reaguje osobno.

## Start

```bash
cd ~/Documents/visuals && python3 serve.py
```

Otwórz `http://localhost:8080` w Chrome. Localhost jest wymagany, bo przeglądarka
daje dostęp do wejścia audio tylko w bezpiecznym kontekście.

**Dwa ekrany:** klawisz `O` otwiera okno wyjścia na projektorze (szczegóły niżej, w sekcji „Projektor”).
**Jeden ekran:** `F` daje pełny ekran bez panelu, `Esc` wraca do panelu.

## Jak podpiąć dźwięk (od najlepszego)

1. **Kabel z miksera → interfejs audio.** Wyjście Booth / Rec / Master 2 z miksera
   podłącz do dowolnego interfejsu USB (albo do wejścia kontrolera, jeśli je ma).
   W DRIFT wybierz to wejście z listy w górnym pasku (wybór od razu podłącza). Sygnał jest czysty, bez hałasu sali
   i bez sprzężeń, a do tego niezależny od głośności w klubie.
2. **Grasz z laptopa (Rekordbox / Traktor / Serato na tym samym Macu):** zainstaluj
   [BlackHole 2ch](https://existential.audio/blackhole/) (darmowy). W „Audio MIDI Setup”
   utwórz „Multi-Output Device” (kontroler + BlackHole) albo w programie DJ wyślij master
   na BlackHole. W DRIFT wybierz z listy „BlackHole 2ch”.
3. **Mikrofon (awaryjnie):** też działa. Przetwarzanie „rozmowowe” przeglądarki
   (redukcja szumu, AGC, echo) jest wyłączone, każde pasmo ma własną automatyczną
   normalizację, a stopa wykrywana jest tylko w paśmie sub (35–110 Hz), które
   w klubie dominuje. Test na syntetycznym sygnale przy −82 dB wykrył 28/28 stóp.
   Gdy mikrofon słabo łapie dźwięk, podkręć **czułość** (suwak przy miernikach, 0…+40 dB)
   tak, żeby zielony pasek IN sięgał ponad połowę. Suwak można przypisać do MIDI w trybie Learn.
4. **Bez dźwięku:** tryb Demo i `TAP` (T). Do prób w domu wybierz z listy „Plik audio…” — DRIFT
   odtworzy nagranie i zareaguje na nie jak na żywe audio. Wizualizacje dalej chodzą w tempie,
   a zegar sam trzyma BPM.

Na dłuższy set warto kliknąć `SYNC 1` (Enter) na pierwszą stopę frazy. Autopilot
liczy wtedy 16 taktów od właściwego miejsca. Po dropie wyrównuje się sam.

## Jak to działa

- **Analiza:** 4 pasma (sub / low / mid / high), każde normalizowane do swojego szczytu,
  który wolno opada (AGC). Stopa = nagły skok w sub powyżej adaptacyjnego progu.
- **Zegar:** tempo z histogramu odstępów między stopami + regresja; faza dociągana
  do stóp (PLL). Breakdown = brak stopy przez 8 beatów. Drop = dwie stopy w odstępie
  jednego beatu po breakdownie.
- **Autopilot:** co 8/16/32 taktów zmienia scenę (60%) albo wariację. Na breakdown
  płynnie przechodzi do spokojnej sceny, na drop robi cięcie do mocnej sceny
  i flash. Kropka ● przy scenie włącza ją do puli autopilota lub z niej wyłącza.
  Ręczna zmiana resetuje licznik, więc autopilot nie nadpisze jej od razu.

## Ręczny drop

Sekcja **Drop** w lewej kolumnie (klawisz `D` uzbraja / anuluje z ostatnią długością):
1. Klikasz **1 / 4 / 8 / 16** — drop wypadnie na początku taktu za tyle taktów (zgodnie z siatką
   beatów, więc warto wcześniej zrobić SYNC na początku frazy). Pasek odlicza takty i beaty.
2. **Narastanie** w trakcie odliczania (do wyboru): Rozmycie (smugi rosną do maksimum),
   Przyspieszenie (ruch coraz szybszy), Ściemnianie (obraz gaśnie), Strobo (ostatni takt:
   ósemki, ostatnie 2 beaty: szesnastki), Glitch (narasta w ostatnich 2 taktach), Rozpad
   (obraz pęka i rozpada się przez całe odliczanie, a na dropie składa się w jednej chwili).
3. **Program dropu** — 4 listy: Głębia, Tło, Kolory głębi, Kolory tła. Domyślnie pokazują to,
   co gra teraz (= bez zmian). Wybierz scenę/tło/paletę albo „losowa”, a pole się podświetli —
   w momencie dropu wejdzie cięciem. Wybranie tego, co gra, kasuje program pola. Po dropie
   program się czyści. Dodatkowo przełączniki „Na dropie”: Wariacja i Flash.
   Efekty narastania puszczają od razu, a drop staje się początkiem frazy dla autopilota.

W trakcie odliczania autopilot nie zmienia scen. Przyciski dropu można przypisać do MIDI
(Learn albo okno Mapowanie). Ponowny klik tej samej długości anuluje drop.

## Warstwy

- **Głębia** (klawisze 1–0 i Q W E R Y U I): pierwszy plan. Łuki, Rdzeń, Pole, Pierścienie, Spirala,
  Rtęć, Gyroid, Kryształ, Organizm i Arteria to prawdziwe 3D (raymarching). Tunel, Korytarz, Kalejdoskop,
  Orbity i Puls są płaskie. Fraktale: Rdzeń (gąbka Mengera), Kryształ (KIFS),
  Mandelbulb i Apollonius (lot przez jaskinie z kul). Fale: świecące kręgi widma — co pół taktu
  rodzi się kontur w kształcie okrągłego wykresu częstotliwości i rozchodzi się, lekko skręcony. Klik w scenę
  płynnie do niej przechodzi; czas przejścia (cięcie / 1 beat / 1 takt / 4 takty) ustawiasz pod scenami
  głębi. Tło ma osobny przełącznik (cięcie / 1 / 2 / 4 takty) pod listą teł.
- **Organiczne (druga seria):** Grzybnia (lot przez sieć włókien z impulsami), Muszla (spirala łodzika,
  kamera bez końca wkręca się do środka), Kręgosłup (wijący się łańcuch kręgów), Kosmki (tunel
  z falujących wypustek), Nasiona (wirujące strąki). Sceny bez klawisza (powyżej 21.) wybierasz kliknięciem.
- **Płyny (koniec listy):** Ferrofluid (czarna ciecz; pod nią dryfuje magnes, kolce rosną tam, gdzie
  jest magnes, i wydłużają się z basem i stopą), Lampa lawa, Wir (lejek, obroty z basem),
  Żebra (klatka piersiowa z kręgosłupem i pulsującym rdzeniem; żebra rozchylone jak skrzydła, wariacja zmienia stopień otwarcia).
- **Tło** (`G` / `Shift+G`): Mgła, Poświata, Horyzont, Moiré, Strata, Skaner, Pustka
  (prawie czarne — sama głębia na czerni), Pył, Zorza, Raster, Izolinie, Julia (płynący
  fraktal 2D, pasma rozchodzą się w rytm beatu), Tafla (spokojna ciemna woda: co beat
  w losowym miejscu spada kropla, stopa = mocniejsza, bas wzmacnia falę powierzchni). Organiczne: Bioluminescencja (drobny
  plankton rozbłyska falą co 2 beaty), Atrament (gruby, lśniący tusz w dwóch warstwach), Słoje,
  Liść (obraca się, puls płynie żyłkami), Mitoza (komórki zlewają się błonami przy zetknięciu,
  dzielą z przewężeniem; każda płynie po własnym wektorze), Żyły (puls z wędrującego serca).
  Płyny (koniec listy): Cymatyka (fale stojące z częstotliwości), Kaustyki, Marmurkowanie, Olej na wodzie,
  oraz symulacje (stan żyje między klatkami, `js/sim.js`): **Ciecz** — prawdziwa symulacja płynu, stopa
  wstrzykuje barwne wiry, bas stale miesza; **Reakcja-dyfuzja** — wzory Turinga rosnące na żywo, stopa
  zasiewa nowe plamy, wariacja zmienia rodzaj wzoru (koral / plamy / robaki / komórki). Wzór rośnie, aż
  przestanie przybywać, potem powoli się cofa i odrasta od nowa z kilku zarodków.
  Tło prześwituje tam, gdzie głębia jest pusta albo ginie we mgle.
- **Parametry per warstwa:** głębia ma Intensywność, Reaktywność, Ruch (prędkość, 100 = normalnie)
  i Smugi. Tło ma Jasność, Reaktywność i Ruch. Smugi działają tylko na głębi, więc tło zostaje ostre.
  Dobry punkt wyjścia: tło wolniej i słabiej reagujące niż głębia.
- **Balans Tło ↔ Głębia** (`← →`, `↓` = środek): 0 to samo tło, środek to oba plany,
  a 1 sama głębia. `L` chowa głębię i przywraca ją później.
- **Nakładanie** (`M`) mówi, jak głębia łączy się z tłem:
  - **Normalny:** głębia zasłania tło.
  - **Światło:** jasne partie obu warstw się sumują.
  - **Maska:** tło widać tylko w kształtach głębi.
  - **Różnica:** tam, gdzie obie warstwy są jasne, robi się ciemno.
- **Kolory per warstwa:** głębia i tło mają osobne palety (sekcja „Paleta”), np. zimna głębia
  na ciepłym tle. „Tło w kolorach głębi” łączy je z powrotem w jedną.
- **Autopilot** co kilka fraz zmienia tło i czasem tryb nakładania. W breakdownie przełącza
  tło na spokojne i albo chowa głębię, albo daje spokojną scenę. Na dropie wraca z głębią cięciem.

## MIDI

1. Podłącz kontroler i kliknij **MIDI** w górnym pasku (Chrome zapyta o zgodę; potem włącza się sam).
2. Kliknij **Learn**. Elementy, które da się przypisać, dostaną przerywaną ramkę.
3. Kliknij element panelu (scenę, suwak, przycisk, paletę, tryb nakładania...), a potem
   rusz gałką/faderem albo naciśnij pad/przycisk na kontrolerze. Gotowe. Możesz od razu
   przypisywać kolejne.
4. Prawy klik na elemencie w trybie Learn usuwa jego przypisanie. `Esc` lub **Learn** kończy.

**Mapowanie** (przycisk w górnym pasku) to tabela wszystkich przypisań:
- „+ Dodaj: rusz kontrolką” — ruszasz gałką/padem, pojawia się wiersz, wybierasz akcję z listy,
- kolumna **Wartość** i **Ostatni wynik** pokazują na żywo, co przychodzi i co DRIFT z tym zrobił
  (np. „suwak = 71% (abs)”) — od razu widać, czy kontrolka działa,
- **Tryb gałki**: auto / absolutna / względna 64± / względna 1/127. Gdy suwak skacze od ściany
  do ściany, ustaw „absolutna” (albo odwrotnie — „względna”, jeśli gałka się kręci bez końca
  i suwak ledwo się rusza).

- Gałki i fadery (CC) sterują suwakami w pełnym zakresie; przyciski i pady klikają przyciski.
  **Strobo** działa tylko, póki trzymasz przycisk.
- W trybie Learn pojawia się sekcja **Dodatkowe akcje MIDI**: następna/poprzednia scena głębi
  i tła, kolejny tryb nakładania, balans na środek, zmiana kolorów oraz **gałki do przewijania
  scen** (przekręcasz gałkę, sceny zmieniają się po kolei).
- Przypisania zapisują się w przeglądarce. Status w pasku pokazuje liczbę urządzeń, przypisań
  i ostatnio odebraną kontrolkę (przydatne, gdy nie wiadomo, co wysyła kontroler).
- **MIDI clock:** jeśli urządzenie lub program wysyła zegar MIDI, DRIFT bierze z niego dokładne
  BPM (w pasku pojawia się CLOCK). Komunikat Start ustawia też początek frazy.

**Arturia MiniLab 3** ma gotowy układ, który ładuje się sam po podłączeniu (gdy nie masz własnych
przypisań). Można go też wczytać przyciskiem „Układ MiniLab 3” w trybie Learn:

| MiniLab 3 | DRIFT |
|---|---|
| Gałki 1–4 (CC 86 87 89 90) | Głębia: Intensywność, Reaktywność, Ruch, Smugi |
| Gałki 5–8 (CC 110 111 116 117) | Balans Tło ↔ Głębia, Tło: Jasność, Reaktywność, Ruch |
| Fader 1 / 2 (CC 14 / 15) | przewijanie scen głębi / przewijanie teł |
| Fader 3 / 4 (CC 30 / 31) | wolne — przypisz w trybie Learn |
| Pady bank A | Flash, Strobo, Glitch, Wariacja głębi, ◀ ▶ tło, Wariacja tła, SYNC |
| Pady bank B | Flash, Strobo, Glitch, Wariacja głębi, kolory głębi ▶, ◀ ▶ tło, SYNC |
| Przyciski CC 109 / 105 / 28 / 107 | TAP, Wariacja tła, kolory tła ▶ (×2) |
| Klawisze od C3 | kolejne sceny głębi (jedna scena na klawisz; dalsze — po Oct+) |

Port „Minilab3 MCU/HUI” (tryb DAW) jest ignorowany — dubluje fadery jako pitch bend.
Pitch bend z normalnego portu (pasek dotykowy) można przypisać w trybie Learn jak gałkę.
Każdy komunikat MIDI jest logowany w konsoli przeglądarki (`Cmd+Option+J`) z informacją,
czy jest przypisany; `DRIFT.midi.debug = false` wyłącza log.

**XDJ-RX3:** jeśli RX3 wysyła komunikaty MIDI albo zegar, DRIFT je odbierze. Po podłączeniu
sprawdź status MIDI w pasku: pokazuje liczbę urządzeń i ostatnio odebraną kontrolkę (np. `CC21`).

## Licznik FPS

W prawym górnym rogu podglądu: klatki na sekundę i czas klatki. Z otwartym oknem wyjścia pokazuje
FPS projektora („WYJŚCIE …”). Zielony = płynnie, żółty < 55 fps, czerwony < 40 fps — wtedy wyłącz
„Wysoką rozdzielczość” albo wybierz lżejszą scenę. Podgląd schowany w tle przeglądarki jest dławiony,
więc pokazuje mniej — miarodajne jest okno, na które patrzysz.

## Jakość obrazu

W kolumnie Głębia, „Jakość obrazu”:
- **Wygładzanie krawędzi** (domyślnie włączone): filtr FXAA na warstwie głębi — usuwa schodki
  na krawędziach scen 3D, praktycznie bez kosztu wydajności.
- **Wysoka rozdzielczość** (domyślnie włączona): sceny liczone w 1,5× rozdzielczości i pomniejszane.
  Najwięcej detalu, ale ok. 2× większe obciążenie karty graficznej. Render nigdy nie jest gęstszy niż
  2 piksele na piksel ekranu, więc na ekranach Retina opcja niewiele zmienia.

## Projektor

Nie duplikuj ekranów. W macOS ustaw projektor jako **rozszerzony** ekran
(Ustawienia → Wyświetlacze, bez „Duplikuj”). Klawisz `O` otwiera okno wyjścia.
Za pierwszym razem Chrome zapyta o dostęp do układu ekranów. Po zgodzie okno wyjścia
otwiera się od razu na projektorze (przed zgodą trzeba je tam przeciągnąć).
Kliknięcie w okno wyjścia włącza pełny ekran. Panel zostaje na laptopie.

## Skróty

| Klawisz | Akcja |
|---|---|
| 1–0, Q–I | scena głębi (z Shift = cięcie zamiast przejścia) |
| G / Shift+G | następne / poprzednie tło |
| L | głębia on/off (samo tło) |
| ← → / Shift+← → / ↓ | balans tło/głębia / do końca / na środek |
| M | tryb nakładania warstw |
| Spacja | autopilot on/off |
| T / Enter | tap tempo / początek frazy (BPM można też wpisać w polu) |
| D | uzbrój / anuluj ręczny drop |
| P / Shift+P | następna paleta głębi / tła |
| V / Shift+V | nowa wariacja sceny głębi / tła |
| X / S (trzymaj) / B | flash / strobo / blackout |
| Z (trzymaj) | glitch: rozszczepienie RGB, przesunięte pasy i bloki, w rytm ósemek |
| C | rozpad: obraz pęka i przez 4 takty rozpada się na opadające odłamki (pod nimi delikatny szum); ponownie = złożenie |
| [ ] | intensywność głębi |
| F / H / O | pełny ekran / ukryj panel / okno wyjścia |

## Dodawanie własnych rzeczy

- **Scena:** dopisz obiekt w `js/scenes.js` (`id`, `name`, `layer`, `mood`, `frag`,
  a dla sceny 3D także `map`). Dostępne uniformy są opisane w `COMMON`. Scena, która się nie skompiluje, jest oznaczona
  na czerwono w panelu (błąd w tooltipie), a reszta działa dalej.
- **Paleta:** jedna linijka w `js/palettes.js`.

## Pliki

- `js/audio.js`: wejście audio, analiza pasm, detekcja stopy, zegar BPM, tryb demo
- `js/director.js`: stan, autopilot, breakdown/drop, budowa klatki
- `js/engine.js`: renderer (przejścia między scenami, feedback/smugi, flash, blackout)
- `js/sim.js`: sceny-symulacje z pamięcią (ciecz, reakcja-dyfuzja)
- `js/scenes.js`, `js/palettes.js`: treść wizualna
- `js/main.js`, `js/keys.js`: panel, okno wyjścia i skróty
