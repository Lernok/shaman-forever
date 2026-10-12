// Interface language (es / en). Our own text comes as { es, en } in the data
// and is resolved with localize(); interface strings live in STRINGS below.
// Game names (talents, spells, races, stats) are always English.
(function () {
  const LANGS = ['es', 'en'];
  const STORE_KEY = 'shamanForeverLang';

  const STRINGS = {
    es: {
      'site.tagline': 'Talentos, rotación y gearing para Enhancement, Elemental y Restoration — WoW: Forever (beta)',
      'site.footer': 'Datos de talentos/spellbook: {tf} (CC BY 4.0, leído del cliente beta de WoW: Forever). Guías cruzadas con {wh} e {iv}. Iconos: {zam}. Proyecto fan-made, sin afiliación con Blizzard. Datos de beta — pueden cambiar con hotfixes.',
      'tab.Overview': 'Resumen',
      'tab.Calculadora': 'Calculadora',
      'tab.Spellbook': 'Spellbook',
      'lang.switch': 'English',
      'lang.switchTitle': 'Switch to English',

      'conf.tested': 'Probado en juego',
      'conf.client-data': 'Dato del cliente beta',
      'conf.classic-assumed': 'Asumido de Classic Era',
      'conf.community-untested': 'Comunidad, sin confirmar',
      'conf.official': 'Anuncio de Blizzard',

      'common.sources': 'Fuentes:',
      'common.source': 'fuente',
      'common.level': 'nivel',
      'common.levelCap': 'Nivel',

      'tree.title': 'Árbol de {tree}',
      'tree.hint': 'Click en un talento para ver rangos y cambios vs. Classic Era.',
      'tree.ranks': '{n} rangos',
      'tree.rank': 'Rango {n}',
      'tree.openCalc': 'Abrir la calculadora →',
      'tree.talents': 'Talentos',

      'guide.stats': 'Prioridad de stats',
      'guide.alsoReported': 'También reportado',
      'guide.rotation': 'Rotación',
      'guide.level20': 'Nivel 20',
      'guide.level30': 'Nivel 30',
      'guide.level60': 'Nivel 60',
      'guide.priority': 'Prioridad',
      'guide.keyTotems': 'Totems clave',
      'guide.gear': 'Equipo',
      'guide.keyTalents': 'Talentos clave',
      'guide.builds': 'Builds de ejemplo',

      'ov.role': 'Resumen de la clase',
      'ov.title': 'Shaman — notas generales',
      'ov.intro': 'Lo que aplica a los 3 specs: estado de la beta, totems, daño frente a Classic, razas y profesiones.',
      'ov.classNotes': 'Notas de la clase',
      'ov.calendar': 'Calendario',
      'ov.professions': 'Profesiones',
      'ov.status': 'Estado:',
      'ov.baseline': 'Base',
      'ov.totems': 'Totems e imbues',
      'ov.totemsChanged': 'Totems con números nuevos (rango máximo)',
      'ov.totemsMore': 'Además duran 5 min y llegan a 30 m. Mana Spring, Stoneskin, Windwall, los de resistencia, Tremor y los de limpieza solo ganaron duración y alcance.',
      'ov.damage': 'Daño y curación vs Classic',
      'ov.damageIntro': 'Número del tooltip en el rango máximo, sin poder con hechizos ni talentos. La barra es cuánto queda del valor de Classic.',
      'ov.races': 'Razas',
      'ov.newToShaman': 'nueva para Shaman',
      'ov.colTotem': 'Totem',

      'calc.role': 'Talentos',
      'calc.title': 'Calculadora de talentos',
      'calc.intro': 'Click en un talento para sumar un punto; click derecho, Shift+click o el botón − para sacarlo. Las filas se abren cada 5 puntos en el árbol, y una flecha indica que el talento de arriba tiene que estar al máximo. Un punto por nivel desde el 10 (21 al 30, 51 al 60); el perk de Legacy <b>Talented</b> adelanta hasta 5 niveles el primer punto (26 al 30 con 5/5), con tope de 51. Reglas y datos: talentsforever.com, leídos del cliente beta.',
      'calc.examples': 'Builds de ejemplo',
      'calc.examplesIntro': 'Elegí uno para cargarlo en los árboles y modificarlo. Ninguno está probado en juego todavía; los de nivel 60 son proyecciones porque la beta tiene tope en nivel 30. Todos asumen Talented 0/5 (21 puntos al 30). Los que traen orden de leveo se pueden recorrer cambiando el nivel.',
      'calc.withOrder': 'con orden',
      'calc.level': 'Nivel',
      'calc.talentedTitle': 'Perk de Legacy (cuenta): cada rango adelanta un nivel el primer punto de talento. Tope: 51 puntos.',
      'calc.points': 'puntos',
      'calc.split': 'Reparto',
      'calc.levelNeeded': 'Nivel necesario',
      'calc.copy': 'Copiar link',
      'calc.copied': '¡Copiado!',
      'calc.copyFallback': 'Copiá la URL',
      'calc.reset': 'Reiniciar',
      'calc.following': '· siguiendo su orden al nivel {level}',
      'calc.modified': 'Modificado a partir de un build de ejemplo.',
      'calc.order': 'Orden de leveo ({n} pasos)',
      'calc.lv': 'Nv',
      'calc.nextRow': 'próxima fila a los {n}',
      'calc.allRows': 'todas las filas abiertas',
      'calc.removePoint': 'Quitar un punto de {talent}',
      'calc.current': 'Actual',
      'calc.next': 'Siguiente',
      'origin.guia': 'Basado en la guía',
      'origin.talentsforever': 'Comunidad · talentsforever.com',
      'origin.ejemplo': 'Ejemplo armado acá',

      'sb.title': 'Hechizos del Shaman, Forever vs Classic',
      'sb.intro': 'Cada hechizo de entrenador hasta el 60 con todos sus rangos, leído del cliente beta (build {build}). El porcentaje compara el número principal del tooltip (el punto medio del rango de daño o curación) contra el de Classic en el mismo rango; no incluye poder con hechizos ni talentos. Los textos vienen del cliente en inglés y están traducidos con el glosario del sitio; "ver original" muestra el texto exacto.',
      'sb.all': 'Todos ({n})',
      'sb.new': 'Nuevo',
      'sb.newPl': 'Nuevos ({n})',
      'sb.changed': 'Cambiado',
      'sb.changedPl': 'Cambiados ({n})',
      'sb.same': 'Igual',
      'sb.samePl': 'Iguales ({n})',
      'sb.search': 'Buscar hechizo…',
      'sb.levels': 'Nivel {list}',
      'sb.fromTalent': 'viene con su talento',
      'sb.gone': 'Ya no están en el cliente: {list}.',
      'sb.source': 'spellbook y spell_desc',
      'sb.coef': 'Poder con hechizos',
      'sb.direct': 'directo',
      'sb.perTick': 'por tick',
      'sb.heal': 'curación',
      'sb.rank': 'Rango {n}',

      'classic.label': 'Classic Era',
      'classic.new': 'nuevo',
      'classic.changed': 'cambiado',
      'classic.moved': 'movido',
      'classic.same': 'igual',
      'orig.show': 'ver original',
      'orig.title': 'Texto del cliente en inglés',

      'tab.Armas': 'Armas',
      'wp.role': 'Equipo',
      'wp.title': 'Progresión de armas',
      'wp.intro': 'La mejor arma disponible en cada nivel para tu facción, y de dónde sale cada una. Cada punto del gráfico es un arma; la línea es la mejor que podés tener a ese nivel. Para Enhancement manda el DPS del arma: Stormstrike, Windfury y los ataques automáticos escalan con él.',
      'wp.dataNote': 'Números exactos del cliente de Forever (build {build}) vía Wowhead. Las fuentes de los ítems de Classic vienen de QuestieDB y no están verificadas en Forever.',
      'wp.faction.horde': 'Horda',
      'wp.faction.alliance': 'Alianza',
      'wp.showRandom': 'Incluir drops aleatorios',
      'wp.showUnknown': 'Incluir armas sin fuente conocida',
      'wp.casterNote': 'Para Elemental y Restoration el DPS del arma casi no importa: cuentan el poder con hechizos y el Intelecto. Esta vista todavía ordena por DPS; la versión para casters está en preparación.',
      'wp.group.crafted': 'Crafteo',
      'wp.group.target': 'Drop de un jefe o NPC',
      'wp.group.questvendor': 'Quest o vendedor',
      'wp.group.other': 'Aleatorio o sin fuente',
      'wp.bestLine': 'Mejor disponible',
      'wp.chartLabel': 'DPS del arma según nivel requerido',
      'wp.axisLevel': 'Nivel requerido',
      'wp.axisDps': 'DPS del arma',
      'wp.betaCap': 'tope de la beta',
      'wp.steps': 'Línea de progresión ({n} saltos)',
      'wp.colFrom': 'Desde',
      'wp.colWeapon': 'Arma',
      'wp.colStats': 'Stats',
      'wp.colSource': 'Fuente',
      'wp.allWeapons': 'Todas las armas ({n})',
      'wp.newInForever': 'Nuevo en Forever',
      'wp.sourcesNote': 'Las fuentes marcadas "Asumido de Classic Era" salen de Classic: el ítem existe igual, pero nadie confirmó todavía que se consiga en el mismo lugar en Forever. Los ítems nuevos de Forever que no se craftean no tienen fuente conocida hasta que alguien la reporte.',
      'wp.srcWago': 'tablas del cliente (ítems y recetas)',
      'wp.srcWowhead': 'números exactos de cada ítem',
      'wp.srcQuestie': 'quién dropea, qué quest da y quién vende cada ítem de Classic',
      'wp.atLevel': 'Mejor al nivel {level}',
      'wp.noData': 'Faltan los datos de armas: corré node scripts/sync.js.',
      'wp.src.crafted': '{prof} (la receta deja de ser naranja en {yellow})',
      'wp.src.boss': '{npc} · {zone}',
      'wp.src.drop': '{npc} · {zone}',
      'wp.src.trash': 'Drop aleatorio ({n} enemigos) · {zones}',
      'wp.src.quest': 'Quest: {quest} (nivel {level})',
      'wp.src.vendor': 'Vendedor: {npc} · {zone}',
      'wp.src.unknown': 'Fuente desconocida',
      'wp.obtainFrom': 'se consigue desde el {level}',
      'wp.src.unrecorded': 'Sin fuente registrada (en Classic suele ser drop del mundo o de un NPC raro)',
      'wp.classicNumbers': 'Números de Classic',
      'wp.showRaids': 'Incluir raids de Classic',
      'wp.showPvp': 'Incluir recompensas de rango PvP',
      'wp.showRaidsTitle': 'Forever tiene su propia lista de raids (Barrow Deeps, Hyjal Summit, Onyxia…), así que las fuentes de raids de Classic son las más dudosas.',
      'wp.classicNumbersTitle': 'Forever todavía no publicó este ítem (la beta está topada en 30): daño y stats son los de Classic y pueden cambiar.'
    },
    en: {
      'site.tagline': 'Talents, rotation and gearing for Enhancement, Elemental and Restoration — WoW: Forever (beta)',
      'site.footer': 'Talent/spellbook data: {tf} (CC BY 4.0, read from the WoW: Forever beta client). Guides cross-checked with {wh} and {iv}. Icons: {zam}. Fan-made project, not affiliated with Blizzard. Beta data — may change with hotfixes.',
      'tab.Overview': 'Overview',
      'tab.Calculadora': 'Calculator',
      'tab.Spellbook': 'Spellbook',
      'lang.switch': 'Español',
      'lang.switchTitle': 'Cambiar a español',

      'conf.tested': 'Tested in game',
      'conf.client-data': 'Beta client data',
      'conf.classic-assumed': 'Assumed from Classic Era',
      'conf.community-untested': 'Community, unconfirmed',
      'conf.official': 'Blizzard announcement',

      'common.sources': 'Sources:',
      'common.source': 'source',
      'common.level': 'level',
      'common.levelCap': 'Level',

      'tree.title': '{tree} tree',
      'tree.hint': 'Click a talent to see its ranks and changes vs. Classic Era.',
      'tree.ranks': '{n} ranks',
      'tree.rank': 'Rank {n}',
      'tree.openCalc': 'Open the calculator →',
      'tree.talents': 'Talents',

      'guide.stats': 'Stat priority',
      'guide.alsoReported': 'Also reported',
      'guide.rotation': 'Rotation',
      'guide.level20': 'Level 20',
      'guide.level30': 'Level 30',
      'guide.level60': 'Level 60',
      'guide.priority': 'Priority',
      'guide.keyTotems': 'Key totems',
      'guide.gear': 'Gear',
      'guide.keyTalents': 'Key talents',
      'guide.builds': 'Example builds',

      'ov.role': 'Class overview',
      'ov.title': 'Shaman — general notes',
      'ov.intro': 'What applies to all 3 specs: beta status, totems, damage compared to Classic, races and professions.',
      'ov.classNotes': 'Class notes',
      'ov.calendar': 'Calendar',
      'ov.professions': 'Professions',
      'ov.status': 'Status:',
      'ov.baseline': 'Baseline',
      'ov.totems': 'Totems and imbues',
      'ov.totemsChanged': 'Totems with new numbers (top rank)',
      'ov.totemsMore': 'They also last 5 min and reach 30 yd. Mana Spring, Stoneskin, Windwall, the resistance totems, Tremor and the cleansing totems only gained duration and range.',
      'ov.damage': 'Damage and healing vs Classic',
      'ov.damageIntro': 'Tooltip number at the top rank, with no spell power or talents. The bar is how much of the Classic value is left.',
      'ov.races': 'Races',
      'ov.newToShaman': 'new to Shaman',
      'ov.colTotem': 'Totem',

      'calc.role': 'Talents',
      'calc.title': 'Talent calculator',
      'calc.intro': 'Click a talent to add a point; right-click, Shift+click or the − button to remove it. Rows open every 5 points in the tree, and an arrow means the talent above has to be maxed. One point per level from 10 (21 at 30, 51 at 60); the Legacy perk <b>Talented</b> brings the first point up to 5 levels earlier (26 at 30 with 5/5), capped at 51. Rules and data: talentsforever.com, read from the beta client.',
      'calc.examples': 'Example builds',
      'calc.examplesIntro': 'Pick one to load it into the trees and tweak it. None of them is tested in game yet; the level 60 ones are projections because the beta is capped at 30. All assume Talented 0/5 (21 points at 30). The ones with a leveling order can be stepped through by changing the level.',
      'calc.withOrder': 'with order',
      'calc.level': 'Level',
      'calc.talentedTitle': 'Legacy perk (account-wide): each rank brings your first talent point one level earlier. Cap: 51 points.',
      'calc.points': 'points',
      'calc.split': 'Split',
      'calc.levelNeeded': 'Level needed',
      'calc.copy': 'Copy link',
      'calc.copied': 'Copied!',
      'calc.copyFallback': 'Copy the URL',
      'calc.reset': 'Reset',
      'calc.following': '· following its order at level {level}',
      'calc.modified': 'Modified from an example build.',
      'calc.order': 'Leveling order ({n} steps)',
      'calc.lv': 'Lv',
      'calc.nextRow': 'next row at {n}',
      'calc.allRows': 'all rows open',
      'calc.removePoint': 'Remove a point from {talent}',
      'calc.current': 'Current',
      'calc.next': 'Next',
      'origin.guia': 'Based on the guide',
      'origin.talentsforever': 'Community · talentsforever.com',
      'origin.ejemplo': 'Example made here',

      'sb.title': 'Shaman spells, Forever vs Classic',
      'sb.intro': 'Every trainer spell up to 60 with all its ranks, read from the beta client (build {build}). The percentage compares the tooltip\'s main number (the midpoint of the damage or healing range) against Classic\'s at the same rank; it doesn\'t include spell power or talents.',
      'sb.all': 'All ({n})',
      'sb.new': 'New',
      'sb.newPl': 'New ({n})',
      'sb.changed': 'Changed',
      'sb.changedPl': 'Changed ({n})',
      'sb.same': 'Same',
      'sb.samePl': 'Same ({n})',
      'sb.search': 'Search spell…',
      'sb.levels': 'Level {list}',
      'sb.fromTalent': 'comes with its talent',
      'sb.gone': 'No longer in the client: {list}.',
      'sb.source': 'spellbook and spell_desc',
      'sb.coef': 'Spell power',
      'sb.direct': 'direct',
      'sb.perTick': 'per tick',
      'sb.heal': 'heal',
      'sb.rank': 'Rank {n}',

      'classic.label': 'Classic Era',
      'classic.new': 'new',
      'classic.changed': 'changed',
      'classic.moved': 'moved',
      'classic.same': 'same',
      'orig.show': 'show original',
      'orig.title': 'Client text in English',

      'tab.Armas': 'Weapons',
      'wp.role': 'Gear',
      'wp.title': 'Weapon progression',
      'wp.intro': 'The best weapon available at each level for your faction, and where each one comes from. Every point on the chart is a weapon; the line is the best you can have at that level. For Enhancement, weapon DPS rules: Stormstrike, Windfury and auto-attacks all scale with it.',
      'wp.dataNote': 'Exact numbers from the Forever client (build {build}) via Wowhead. Sources for Classic items come from QuestieDB and are not verified in Forever.',
      'wp.faction.horde': 'Horde',
      'wp.faction.alliance': 'Alliance',
      'wp.showRandom': 'Include random drops',
      'wp.showUnknown': 'Include weapons with no known source',
      'wp.casterNote': 'For Elemental and Restoration, weapon DPS barely matters: spell power and Intellect do. This view still ranks by DPS; the caster version is in progress.',
      'wp.group.crafted': 'Crafted',
      'wp.group.target': 'Boss or NPC drop',
      'wp.group.questvendor': 'Quest or vendor',
      'wp.group.other': 'Random or no source',
      'wp.bestLine': 'Best available',
      'wp.chartLabel': 'Weapon DPS by required level',
      'wp.axisLevel': 'Required level',
      'wp.axisDps': 'Weapon DPS',
      'wp.betaCap': 'beta cap',
      'wp.steps': 'Progression line ({n} upgrades)',
      'wp.colFrom': 'From',
      'wp.colWeapon': 'Weapon',
      'wp.colStats': 'Stats',
      'wp.colSource': 'Source',
      'wp.allWeapons': 'All weapons ({n})',
      'wp.newInForever': 'New in Forever',
      'wp.sourcesNote': 'Sources marked "Assumed from Classic Era" come from Classic: the item exists, but nobody has confirmed yet that it drops in the same place in Forever. New Forever items that are not crafted have no known source until someone reports it.',
      'wp.srcWago': 'client tables (items and recipes)',
      'wp.srcWowhead': 'exact numbers for each item',
      'wp.srcQuestie': 'who drops, which quest rewards and who sells each Classic item',
      'wp.atLevel': 'Best at level {level}',
      'wp.noData': 'Weapon data is missing: run node scripts/sync.js.',
      'wp.src.crafted': '{prof} (recipe stops being orange at {yellow})',
      'wp.src.boss': '{npc} · {zone}',
      'wp.src.drop': '{npc} · {zone}',
      'wp.src.trash': 'Random drop ({n} enemies) · {zones}',
      'wp.src.quest': 'Quest: {quest} (level {level})',
      'wp.src.vendor': 'Vendor: {npc} · {zone}',
      'wp.src.unknown': 'Unknown source',
      'wp.obtainFrom': 'obtainable from {level}',
      'wp.src.unrecorded': 'No recorded source (in Classic, usually a world or rare-mob drop)',
      'wp.classicNumbers': 'Classic numbers',
      'wp.showRaids': 'Include Classic raids',
      'wp.showPvp': 'Include PvP rank rewards',
      'wp.showRaidsTitle': 'Forever has its own raid lineup (Barrow Deeps, Hyjal Summit, Onyxia…), so Classic raid sources are the least certain.',
      'wp.classicNumbersTitle': 'Forever has not published this item yet (the beta is capped at 30): damage and stats are Classic\'s and may change.'
    }
  };

  function readStored() {
    try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }

  function initialLang() {
    const fromUrl = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(fromUrl)) return fromUrl;
    const stored = readStored();
    if (LANGS.includes(stored)) return stored;
    return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
  }

  let lang = initialLang();
  const listeners = [];

  function t(key, vars) {
    let s = STRINGS[lang][key];
    if (s == null) s = STRINGS.es[key];
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return s;
  }

  // Deep copy with every { es, en } leaf resolved to the current language.
  function localize(v) {
    if (Array.isArray(v)) return v.map(localize);
    if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 2 && 'es' in v && 'en' in v) return v[lang];
      const out = {};
      keys.forEach(k => { out[k] = localize(v[k]); });
      return out;
    }
    return v;
  }

  function setLang(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* private mode: keep it for this visit */ }
    const url = new URL(location.href);
    url.searchParams.set('lang', lang);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    apply();
    listeners.forEach(fn => fn(lang));
  }

  // Static markup: elements with data-i18n get their text from STRINGS.
  function apply() {
    document.documentElement.lang = lang;
    if (window.TalentRules) window.TalentRules.setLang(lang);
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    const footer = document.querySelector('[data-i18n-html="site.footer"]');
    if (footer) {
      const a = (href, text) => '<a href="' + href + '" target="_blank" rel="noopener">' + text + '</a>';
      footer.innerHTML = t('site.footer', {
        tf: a('https://talentsforever.com', 'talentsforever.com'),
        wh: a('https://www.wowhead.com/forever', 'Wowhead Forever'),
        iv: a('https://www.icy-veins.com/wow-forever', 'Icy Veins'),
        zam: a('https://wow.zamimg.com', 'wow.zamimg.com')
      });
    }
    const btn = document.getElementById('langToggle');
    if (btn) { btn.textContent = t('lang.switch'); btn.title = t('lang.switchTitle'); }
  }

  // ---------- game client text (GLOSARIO.md, section 4) ----------
  const NUM = /\d+(?:[.,]\d+)*/g;

  // 2.5 -> 2,5 and 1,508 -> 1.508 in Spanish; English keeps the client's format.
  function num(s) {
    return lang === 'es' ? String(s).replace(/[.,]/g, c => (c === '.' ? ',' : '.')) : String(s);
  }

  // Tooltip text from the client, through its Spanish template when in Spanish.
  // Templates are keyed by the English text with every number replaced by #.
  function client(text) {
    if (!text || lang !== 'es' || !window.CLIENT_ES) return text;
    const tpl = window.CLIENT_ES[text.replace(NUM, '#')];
    if (tpl == null) return text;
    const nums = text.match(NUM) || [];
    return tpl.replace(/\{(\d+)\}/g, (m, i) => num(nums[Number(i)]));
  }

  // "428 to 476" style ranges.
  function range(s) {
    return lang === 'es' && s ? num(s).replace(' to ', ' a ') : s;
  }

  // Stat names in the priority lists are mechanics vocabulary, not proper nouns.
  const TERMS_ES = {
    'Spell Power': 'Poder con hechizos',
    'Attack Power': 'Poder de ataque',
    'Healing Power': 'Poder de curación',
    'Intellect': 'Intelecto',
    'Spirit': 'Espíritu',
    'Stamina': 'Aguante',
    'Strength': 'Fuerza',
    'Agility': 'Agilidad',
    'Critical Strike': 'Golpe crítico',
    'Hit': 'Índice de golpe',
    'Haste': 'Celeridad',
    'Weapon Damage': 'Daño del arma',
    'Mana Regeneration (MP5)': 'Regeneración de maná (MP5)'
  };
  function term(name) {
    return lang === 'es' && TERMS_ES[name] ? TERMS_ES[name] : name;
  }

  // Collapsed block with the client's exact English text, shown under any
  // translated tooltip so the source is one click away. Empty in English.
  function original(texts) {
    const list = texts.filter(Boolean);
    if (lang !== 'es' || !list.length) return '';
    return '<details class="orig"><summary title="' + t('orig.title') + '">' + t('orig.show') + '</summary>' +
      list.map(x => '<div>' + x + '</div>').join('') + '</details>';
  }

  window.I18N = {
    get lang() { return lang; },
    t, localize, setLang, apply, client, num, range, term, original,
    onChange(fn) { listeners.push(fn); },
    toggle() { setLang(lang === 'es' ? 'en' : 'es'); }
  };
})();
