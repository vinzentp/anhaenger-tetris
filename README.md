# Anhänger-Tetris

3D-Tetris für den Anhänger: Möbelstücke aus dem Hof möglichst clever auf die Ladefläche packen, danach so viele Umzugskartons wie möglich. Reines HTML, CSS und JavaScript, 3D mit three.js (per CDN).

**Spielen:** https://vinzentp.github.io/anhaenger-tetris/

## Lokal starten

ES-Module brauchen einen Webserver, `file://` geht nicht:

```bash
python3 -m http.server 8123
```

Dann http://localhost:8123 öffnen.

## Spielen

- Möbelstück anklicken, über den Anhänger führen, Klick (oder Leertaste) lässt es fallen.
- Q/E drehen, R/F kippen, Pfeile/WASD schieben (Shift: 1 cm), Esc legt das Teil in der Hand wieder dorthin, wo es herkam (bei einem Fehlklick auch zurück in den Anhänger).
- „Zurück“ (Z) geht bis zu 25 Schritte zurück, „Vor“ (Y) wieder vor. Ein Schritt ist jede Änderung der Ladung, eine eingespielte Lösung zählt als ein Schritt.
- Grüner Umriss: passt. Rot: zu hoch oder zu groß.
- Ein Klick auf den Kartonstapel neben dem Anhänger (oder „+ Karton“ im Panel) holt einen Umzugskarton (60 × 33 × 34 cm), beliebig oft. Zurückgelegte Kartons verschwinden wieder.
- „Lösung zeigen“ sucht eine Packung, die alle Möbel und möglichst viele Kartons unterbringt (bis zu 30 s, im Hintergrund), und lädt sie ein.
- Fährt die Kamera in ein Gebäude oder steht eins im Blick, wird es ausgeblendet.
- Im Hof streunt eine schwarze Katze herum. Anklicken lohnt sich.
- Die Anhängermaße (Innenmaß) sind im Panel einstellbar. Der Stand wird im Browser gespeichert.

## Möbel hinzufügen

Jedes Möbelstück ist in `js/furniture.js` eine Liste achsenparalleler Quader in cm (x = Länge, y = Höhe, z = Tiefe). Die Quader sind gleichzeitig Optik und Kollision, deshalb lassen sich Teile ineinander schachteln (z. B. ein umgedrehtes Couchteil über die Sitzfläche eines anderen). Neues Möbel: Funktion schreiben, die Quader liefert, und einen Eintrag in `CATALOG` ergänzen.

## Dateien

- `js/furniture.js`: Möbelkatalog (Couch: Eckteil 87 × 85, Seitenteile 1,53 m und 1,86 m, 5 Sitz- und 6 Rückenkissen einzeln; zwei Matratzen 200 × 90 × 20) und Umzugskarton
- `js/physics.js`: 90°-Drehungen, Fallen lassen, Kollision
- `js/solver.js`: Lösungssuche, läuft in `js/solver-worker.js`. Höhenkarte im 1-cm-Raster; Möbel per Beam-Search (alle 24 Drehungen, Positionen an Wänden und Kanten, bewertet nach verlorenem Platz), die Kissen danach der Größe nach in die besten Lücken, zuletzt Kartons gierig an die jeweils tiefste freie Stelle
- `js/scene.js`: Anhänger mit Bordwänden, Spriegel und Plane, Hof
- `js/cat.js`: die Katze
- `js/main.js`: Spiellogik, Eingabe, UI
