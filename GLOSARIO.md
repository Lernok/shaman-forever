# Glosario y límites de traducción (es / en)

El sitio es bilingüe para que alguien que lee español o inglés entienda todo en su idioma.
Para que no quede spanglish, cada palabra cae en una de estas cuatro categorías, con una regla fija.

## 1. Nombres propios del juego: siempre en inglés

Talentos, hechizos, ítems (incluidos los totems como ítem: Earth Totem, Ankh), razas y racials, zonas, NPCs,
specs (Elemental, Enhancement, Restoration) y la clase (Shaman). Ejemplo: "tus hechizos Lightning Bolt y Chain Lightning".

## 2. Jerga de jugador: igual en los dos idiomas

Lista cerrada. No se traduce ni se explica:
DPS, tank, healer, build, leveling, proc, buff, CD, BiS, AoE, pull, HoT, crit (como sustantivo corto), respec, dual spec, gear.

## 3. Vocabulario de mecánicas: se traduce siempre, con estos términos

| Inglés | Español |
|---|---|
| Intellect / Spirit / Stamina / Strength / Agility | Intelecto / Espíritu / Aguante / Fuerza / Agilidad |
| Spell Power / Attack Power | poder con hechizos / poder de ataque |
| Healing Power | poder de curación |
| Critical Strike (stat) / critical strike | Golpe crítico / golpe crítico |
| Hit / Haste | Índice de golpe / Celeridad |
| Weapon Damage | Daño del arma |
| Mana Regeneration (MP5) | Regeneración de maná (MP5) |
| Mana / health | maná / salud |
| Nature / Fire / Frost damage | daño de Naturaleza / Fuego / Escarcha |
| cast time · "2.5 sec cast" | tiempo de lanzamiento · "Lanzamiento de 2,5 s" |
| cooldown · "10 sec cooldown" | tiempo de reutilización · "Reutilización de 10 s" (en prosa: CD) |
| Instant / Passive / Channeled | Instantáneo / Pasivo / Canalizado |
| range · "30 yd range" · yards | alcance · "Alcance de 30 m" · metros (m) |
| Melee Range / Unlimited range | Alcance cuerpo a cuerpo / Alcance ilimitado |
| Tools / Reagents | Herramientas / Componentes |
| threat / dodge / parry / block / armor | amenaza / esquivar / parar / bloquear / armadura |
| party / raid members | miembros del grupo / de la banda |
| rank | rango |
| Fire totem (genérico, no un hechizo) | totem de fuego |

Unidades: `sec` → `s`, `min` → `min`, `hour` → `h`, `yd`/`yards` → `m`. Decimales con coma y miles con punto en español
(2,5 s · 1.508); en inglés al revés (2.5 sec · 1,508).

## 4. Textos del cliente (tooltips): se traducen con plantillas que no pueden perder números

Los tooltips de talentos, hechizos y racials vienen en inglés del cliente beta. Cada texto distinto se traduce una vez
como plantilla, con `{0}`, `{1}`… en lugar de los números (todos los rangos de un talento comparten plantilla).
`data/i18n/client-es.json` guarda las plantillas, indexadas por el texto en inglés con `#` en lugar de cada número.

`scripts/build-data.js` se niega a generar si falta la plantilla de algún texto del cliente, o si una plantilla no usa
cada número exactamente una vez. En modo español cada tooltip traducido tiene "ver original" con el texto exacto del cliente.
