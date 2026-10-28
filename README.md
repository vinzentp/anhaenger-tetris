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

- Gesteuert wird nur mit den Pfeilen (Tastatur oder Pfeilknöpfe am Handy). Mit der Maus oder per Tippen holt man ein Teil aus dem Hof (oder mit Tab) oder nimmt ein geladenes wieder heraus, Leertaste lässt es fallen.
- Pfeil tippen schiebt 5 cm (Shift: 1 cm), halten lässt das Teil gleiten. Wo es bündig an einer Wand oder einem geladenen Teil anliegt, bleibt es kurz stehen.
- Q/E drehen, R/F kippen, K holt einen Karton, Esc legt das Teil in der Hand wieder dorthin, wo es herkam (bei einem Fehlklick auch zurück in den Anhänger).
- „Zurück“ (Z) geht bis zu 25 Schritte zurück, „Vor“ (Y) wieder vor. Ein Schritt ist jede Änderung der Ladung, eine eingespielte Lösung zählt als ein Schritt.
- Grüner Umriss: passt. Rot: zu hoch oder zu groß.
- Ein Klick auf den Kartonstapel neben dem Anhänger (oder „+ Karton“ im Panel) holt einen Umzugskarton (60 × 33 × 34 cm), beliebig oft. Zurückgelegte Kartons verschwinden wieder.
- „Lösung zeigen“ sucht eine Packung, die alle Möbel und möglichst viele Kartons unterbringt (30 s, mehrere Suchläufe parallel im Hintergrund), und lädt sie in der gefundenen Reihenfolge ein. Kartons können dabei auch vor Möbeln kommen, etwa unter einer Matratze.
- Fährt die Kamera in ein Gebäude oder steht eins im Blick, wird es ausgeblendet.
- Die Teile der Plane, durch die man von außen auf die Ladung schauen würde (Dach, Stirnseite, Längsseite), blenden sich je nach Blickrichtung aus.
- Im Hof lebt eine schwarze Katze: Sie streunt herum, setzt sich, legt sich hin, räkelt sich auf dem Rücken und streicht an Möbeln, Kartons und Wänden entlang. Anklicken lohnt sich.
- „📷 Foto“ (oder O) speichert das aktuelle Bild als PNG mit einer Zeile, was geladen ist; am Handy öffnet sich stattdessen Teilen.
- Die Anhängermaße (Innenmaß) sind im Panel einstellbar. Der Stand wird im Browser gespeichert.

## Möbel hinzufügen

Jedes Möbelstück ist in `js/furniture.js` eine Liste achsenparalleler Quader in cm (x = Länge, y = Höhe, z = Tiefe). Die Quader sind gleichzeitig Optik und Kollision, deshalb lassen sich Teile ineinander schachteln (z. B. ein umgedrehtes Couchteil über die Sitzfläche eines anderen). Neues Möbel: Funktion schreiben, die Quader liefert, und einen Eintrag in `CATALOG` ergänzen.

## Dateien

- `js/furniture.js`: Möbelkatalog (Couch: Eckteil 87 × 85, Seitenteile 1,53 m und 1,86 m, 5 Sitz- und 6 Rückenkissen einzeln; zwei Matratzen 200 × 90 × 20) und Umzugskarton
- `js/physics.js`: 90°-Drehungen, Fallen lassen, Kollision
- `js/solver.js`: Lösungssuche, läuft in `js/solver-worker.js` (bis zu vier Worker mit verschiedenem Startwert, der beste gewinnt). Höhenkarte im 1-cm-Raster; Möbel, Kissen und Kartons bilden eine gemeinsame Fallreihenfolge. Jedes Teil kommt in die Drehung und an die Stelle (bündig an Wand oder Kante), die am wenigsten Platz unter der Ladung verschenkt. Simulated Annealing verändert die Reihenfolge und Drehungen und behält, was mehr Kartons unterbringt. So können Sitzkissen unter einer Couch, Matratzen in der Mulde eines Couchteils und Matratzen auf Kartonstapeln landen. Beim Standardanhänger in Tests 24 bis 28 Kartons (vorher 16 bis 17)
- `js/scene.js`: Anhänger mit Bordwänden, Spriegel und Plane, Hof
- `js/cat.js`: die Katze
- `js/main.js`: Spiellogik, Eingabe, UI
