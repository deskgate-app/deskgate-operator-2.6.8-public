# Rebuttal Health – Installationsanleitung für die IT (Schweiz)

Browser-Erweiterung «DeskGate Operator» Version 2.6.8 · Microsoft Edge und Google Chrome · Stand Oktober 2026

**Kurz:** Die Erweiterung wird per Richtlinie zwangsinstalliert (Force-Install). Sie brauchen dafür keinen Entwicklermodus, keinen Store und keine Softwareinstallation auf Servern. Der Entwicklermodus ist nur als Ausnahme für einzelne, nicht verwaltete Praxis-PCs während des 30-Tage-Tests vorgesehen (Abschnitt 5).

## Auf einen Blick

| | |
| --- | --- |
| Erweiterungs-ID | `bdhbnbpkkcageebgfabcecolflgembfe` |
| Update-Adresse | `https://deskgate.app/ext/updates.xml` |
| Paket (signiert) | `https://deskgate.app/ext/deskgate-operator-2.6.8.crx` |
| Quellcode (öffentlich) | `https://github.com/deskgate-app/deskgate-operator-2.6.8-public` |
| Netzwerk ausgehend | nur `https://deskgate.app` (Port 443) |
| Browser | Microsoft Edge und Google Chrome (Windows, macOS) |

Alle Versionen sind mit demselben Schlüssel signiert. Die ID bleibt bei Updates gleich, Ihre Richtlinie muss nie angepasst werden.

## 1. Voraussetzung: verwaltetes Gerät

Edge und Chrome übernehmen Erweiterungen ausserhalb ihrer Stores nur auf verwalteten Geräten:

- **Windows:** Mitglied einer Active-Directory-Domäne oder in Microsoft Entra ID / Intune verwaltet. Bei Chrome zusätzlich: Browser in Chrome Enterprise Core registriert.
- **macOS:** über MDM verwaltet (Konfigurationsprofil).

Auf einem nicht verwalteten Gerät ignoriert der Browser die Richtlinie. Für diesen Fall siehe Abschnitt 5.

## 2. Microsoft Edge

Der Wert ist in allen Varianten derselbe:

```
bdhbnbpkkcageebgfabcecolflgembfe;https://deskgate.app/ext/updates.xml
```

**Intune (Settings Catalog):** Microsoft Edge → Extensions → «Control which extensions are installed silently» (`ExtensionInstallForcelist`) → Wert oben eintragen.

**Gruppenrichtlinie (ADMX):** Computerkonfiguration → Administrative Vorlagen → Microsoft Edge → Erweiterungen → «Control which extensions are installed silently» → Aktiviert → Wert oben eintragen.

**Registry (direkt oder über GPO-Einstellungen):**

```
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist]
"1"="bdhbnbpkkcageebgfabcecolflgembfe;https://deskgate.app/ext/updates.xml"
```

Ist der Eintrag `"1"` bereits belegt, nehmen Sie die nächste freie Nummer.

**macOS (MDM-Profil):** Domäne `com.microsoft.Edge`, Schlüssel `ExtensionInstallForcelist` (Array) mit dem Wert oben als String.

## 3. Google Chrome

Gleicher Wert wie bei Edge:

```
bdhbnbpkkcageebgfabcecolflgembfe;https://deskgate.app/ext/updates.xml
```

**Gruppenrichtlinie (ADMX):** Computerkonfiguration → Administrative Vorlagen → Google → Google Chrome → Erweiterungen → «Configure the list of force-installed apps and extensions» → Aktiviert → Wert oben eintragen.

**Intune:** Settings Catalog, Kategorie Google Chrome → Extensions → gleiche Richtlinie (oder über die importierte Chrome-ADMX).

**Chrome Enterprise Core (Google Admin-Konsole):** Chrome-Browser → Apps und Erweiterungen → Nutzer und Browser → Organisationseinheit wählen → «+» → App oder Erweiterung nach ID hinzufügen → «Von einer benutzerdefinierten URL» → ID und Update-Adresse eintragen → Installationsrichtlinie «Installation erzwingen».

**Registry:**

```
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist]
"1"="bdhbnbpkkcageebgfabcecolflgembfe;https://deskgate.app/ext/updates.xml"
```

**macOS (MDM-Profil):** Domäne `com.google.Chrome`, Schlüssel `ExtensionInstallForcelist` (Array).

**Für beide Browser:** Sperren Sie Erweiterungen grundsätzlich (`ExtensionInstallBlocklist` = `*`), tragen Sie die ID zusätzlich in `ExtensionInstallAllowlist` ein. Der Entwicklermodus bleibt aus.

## 4. Kontrolle

1. Richtlinie verteilen (`gpupdate /force` bzw. Intune-Synchronisierung) und den Browser neu starten.
2. `edge://policy` bzw. `chrome://policy` öffnen → «Richtlinien neu laden» (Reload policies). `ExtensionInstallForcelist` muss ohne Fehler erscheinen. Wird sie als blockiert oder ignoriert angezeigt, gilt das Gerät nicht als verwaltet (Abschnitt 1).
3. `edge://extensions` bzw. `chrome://extensions` öffnen: «DeskGate Operator Extension (v2.6.8)» mit der ID oben, als von Ihrer Organisation verwaltet gekennzeichnet. Benutzer können sie nicht entfernen.
4. Updates holt der Browser selbstständig über die Update-Adresse.

**Deinstallation:** Richtlinieneintrag entfernen. Der Browser entfernt die Erweiterung bei der nächsten Synchronisierung.

## 5. Ausnahme: Praxis-PC ohne zentrale Verwaltung (nur Pilotphase)

Ist ein PC weder in einer Domäne noch in einem MDM, installieren wir die Erweiterung für die Dauer des 30-Tage-Tests einmalig selbst, vor Ort oder per Video:

1. Quellcode von GitHub herunterladen (Code → Download ZIP) und in einen festen Ordner entpacken, z. B. `C:\RebuttalHealth\deskgate-operator\`. Der Ordner muss bestehen bleiben, sonst ist die Erweiterung weg.
2. `edge://extensions` bzw. `chrome://extensions` → «Entwicklermodus» einschalten → «Entpackte Erweiterung laden» (Load unpacked) → den Ordner wählen.

Unterschiede zur Zwangsinstallation:

- **Keine automatischen Updates:** Neue Versionen spielen wir von Hand ein.
- **Andere ID:** Die ID hängt vom Ordnerpfad ab. Für die Funktion ist das unerheblich.
- **Hinweis beim Start:** Der Browser kann beim Start auf Erweiterungen im Entwicklermodus hinweisen. Benutzer können die Erweiterung selbst entfernen.

Nach dem Test wird die Installation entweder über Abschnitt 2 oder 3 fest eingerichtet oder vollständig entfernt.

## 6. Erster Start am Arbeitsplatz

1. Symbol anheften und Seitenpanel öffnen.
2. CONFIG: Server `https://deskgate.app` ist voreingestellt. Desk-Code und Desk-Key erhalten Sie von uns.
3. **Schweiz-Modus ist ab dem ersten Start eingeschaltet** und die Oberfläche deutsch. Bitte eingeschaltet lassen. Die Zusatzoption Bildschirmlesung ist gesperrt.
4. Bereits offene Tabs mit KG-System und Versicherer-Portal einmal neu laden.

## 7. Was die Erweiterung tut – und was nicht

**Im Schweiz-Modus:**

- **READ CHART** liest den Seitentext des aktiven Tabs lokal im Browser. Es wird kein Bildschirmfoto erstellt. PDFs und Citrix-Bildschirme ohne Seitentext werden von Hand übernommen.
- **STAGE** füllt Formularfelder anhand einer Wortliste im Browser aus. Für die Feldzuordnung gibt es keinen Serveraufruf.
- **Die Stellungnahme** wird lokal aus wörtlichen Zitaten zusammengesetzt. Was in der Akte fehlt, wird als [FEHLT] markiert.
- **Keine Fernsteuerung:** Alle Eingaben erzeugt die Erweiterung lokal aus dem Seitentext. Der Server sendet keine Befehle. Es wird kein Code nachgeladen (kein `eval`, keine WebSocket-Verbindung, keine externen Skripte).
- **Kein Absenden:** WZW-Bestätigung und Einreichen bleiben bei der Fachperson. Die Erweiterung klickt nie auf Absenden.
- **Falldaten nur im Arbeitsspeicher:** Falldaten liegen nur im Arbeitsspeicher des Seitenpanels und werden bei «NEUER FALL» oder beim Schliessen des Panels verworfen. Lokal gespeichert werden nur Einstellungen (Server-Adresse, Desk-Code, Desk-Key, Schalter).
- **Zugelassene Seiten:** Mit dem Desk-Key legen wir fest, auf welchen Adressen die Erweiterung lesen und ausfüllen darf (Ihr KG-System, die Versicherer-Portale). Auf anderen Seiten verweigert sie.
- **Das Seitenskript** zählt bei einem aktiven Fall, wie viele Zeichen die Fachperson in vorbereiteten Feldern ändert und wie viele Dateien sie anhängt. Es erfasst nur Anzahlen, nie Inhalte.

**Was den Browser verlässt (nur an `deskgate.app`, Server bei Flow Swiss AG, Schweiz):**

| Was | Wann | Inhalt |
| --- | --- | --- |
| Lizenzprüfung | vor dem Lesen oder Ausfüllen auf einer Webseite | Desk-Key |
| Zählzeile | nach dem Einreichen durch die Fachperson | Desk-Code, Hostname des Portals, zufällige Fall-ID, Version, Ja/Nein-Angaben (vorbereitet, geändert, eingereicht), Minuten, Zähler, SHA-256-Prüfwert der Referenznummer des Versicherers (nicht die Nummer selbst) |
| Server-Protokolle | bei jeder Verbindung | IP-Adresse, Zeitpunkt |

Namen, AHV-Nummern, Diagnosen und KG-Texte werden nicht übermittelt.

**Berechtigungen im Manifest:**

| Berechtigung | Wozu |
| --- | --- |
| `sidePanel` | Seitenpanel anzeigen |
| `storage` | Einstellungen speichern (keine Falldaten) |
| `scripting` | Lese- und Ausfüllskript in KG- und Portalseiten einsetzen |
| `tabs`, `activeTab` | erkennen, welcher Tab aktiv ist (KG oder Portal) |
| `contextMenus` | Rechtsklick-Eintrag «Seite lesen» |
| Zugriff auf alle Websites, alle Frames | KG-Systeme und Versicherer-Portale laufen auf vielen Adressen und teils in eingebetteten Frames. Die Einschränkung erfolgt über den Desk-Key. |

Nicht verwendet: `debugger`, `cookies`, `webRequest`, `history`, `downloads`, `nativeMessaging`.

Den Auftragsbearbeitungsvertrag (Schedule CH, Art. 9 DSG) und das Datenschutz-Datenblatt erhalten Sie mit dem Testvertrag.

## Kontakt

Rebuttal Health (DeskGate, Inc.) · Hans Johannes Schulte · contact@deskgate.app · Infolinie +41 31 539 44 31 (digitaler Assistent)
