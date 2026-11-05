# CLAUDE.md

Repo: internetverbinding

## Wat dit is

Hulppagina "Dataverbinding Frankrijk": zoekt een adres op en verwijst naar providers voor fibre, ADSL, 4G/5G-box, Starlink en Nordnet, plus tv- en vpn-links. Eén statische pagina.

## Live adres

Niet in de repo vastgelegd.

## Opbouw

- index.html: de hele tool, met de providerlijsten in het script zelf.
- providers_fr.json: providerlijst met naam, snelheid, type, kwaliteit en url. De pagina leest dit bestand niet meer in; een commentaar in index.html zegt dat het bestand weg is en de gegevens handmatig worden opgebouwd.
- LICENSE.

## Techniek

Vanilla HTML, CSS en JavaScript, geen package.json, geen vercel.json, geen build.

## Externe diensten en namen van omgevingsvariabelen

- data.geopf.fr (adreszoeker van de Franse overheid), zonder sleutel.
- maconnexioninternet.arcep.fr (kaartlink naar de ARCEP-dekking).
- Links naar providers en diensten (Orange, SFR, Bouygues, Free, Starlink, Nordnet, NLZIET, Canal Digitaal, NordVPN, Surfshark).
- Geen omgevingsvariabelen.

## Hoe het live gaat

Niet in de repo vastgelegd.

## Regels en besluiten

Nog geen vastgelegd

Laatst nagelopen: 5 november 2026
