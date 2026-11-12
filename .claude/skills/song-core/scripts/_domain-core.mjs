// Everything `_domain.mjs` exports that does NOT depend on how the domain was
// loaded. Pure: no fs, no process, no console, no jiti.
//
// There are two `_domain.mjs` — the repo's, which loads the real TypeScript
// through jiti, and the zip's, which is a bundle of the same code. They must offer
// the same names with the same behaviour or the scripts that import them cannot be
// the same file in both places. So the part that is genuinely shared is written
// once, here, and each `_domain.mjs` is only the part that differs: getting hold
// of the domain in the first place.

/**
 * Bind a loaded domain into the exports the skill's scripts expect.
 *
 * @param {{ parse: Function, toEnglishNotation: Function, convertChordSheet: Function,
 *          SETTINGS: object, SCHEMA_VERSION: number, theory: object }} loaded
 */
export function makeDomain(loaded) {
  const { parse, convertChordSheet, SETTINGS, theory } = loaded;

  return {
    ...loaded,

    /**
     * Somebody else's chord sheet → Achordeon markup, with the theory bound.
     * The app's own conversion (`convertChordSheet`), so the skill and the app
     * cannot drift apart. A file the domain would not call a chord sheet is still
     * run through as chord rows: here a person already chose to convert it.
     */
    toAchordeon: (text, options = {}) =>
      toAchordeon(convertChordSheet, theory, text, options),

    /** Setting keys the registry allows at each scope (point 5 guardrail). */
    SONG_SETTING_KEYS: keysForScope(SETTINGS, 'song'),
    SONGBOOK_SETTING_KEYS: keysForScope(SETTINGS, 'songbook'),

    inspect: (content) => inspect(content, parse, theory),
  };
}

function toAchordeon(convertChordSheet, theory, text, options) {
  let sheet = convertChordSheet(text, theory, options);
  if (sheet.kind !== 'converted') {
    sheet = convertChordSheet(text, theory, {
      ...options,
      format: 'chord-rows',
    });
  }
  return {
    text: sheet.content,
    report: sumReports(sheet.songs),
    format: sheet.format,
    dialect: sheet.dialect,
    guessedDialect: sheet.guessedDialect,
    songCount: sheet.songs.length,
  };
}

/**
 * One report for the whole joined Content: counts summed, and each song's line
 * numbers moved down by the songs above it (one blank line between songs).
 */
function sumReports(songs) {
  const total = {
    linesIn: 0,
    linesOut: 0,
    merged: 0,
    bareRows: 0,
    chordsPlaced: 0,
    alreadyInline: 0,
    inlineTargets: 0,
    clamped: 0,
    promoted: 0,
    confirmed: 0,
    respelled: 0,
    tabbedLines: 0,
    wasCrlf: false,
    ambiguous: [],
    directives: { converted: 0, dropped: [] },
  };
  let offset = 0;
  for (const { content, report } of songs) {
    for (const key of Object.keys(total)) {
      if (typeof total[key] === 'number') total[key] += report[key];
    }
    total.wasCrlf ||= report.wasCrlf;
    total.ambiguous.push(...report.ambiguous.map((n) => n + offset));
    total.directives.converted += report.directives.converted;
    for (const name of report.directives.dropped) {
      if (!total.directives.dropped.includes(name))
        total.directives.dropped.push(name);
    }
    offset += content.split('\n').length;
  }
  return total;
}

function keysForScope(settings, scope) {
  return Object.keys(settings).filter((k) =>
    settings[k].scopes.includes(scope),
  );
}

/**
 * Parse `content` and summarise what the parser made of it.
 *
 * This is a SYNTAX check — does the markup parse, what structure came out, which
 * brackets are not recognised as chords. It says nothing about whether the chords
 * are musically right or match the source; that is the transcriber's job, not the
 * parser's.
 */
function inspect(content, parse, theory) {
  const ast = parse(content, theory);
  const srcLines = content.split('\n');

  let chordCount = 0;
  const verbatim = [];
  for (const b of ast.blocks) {
    for (const ln of b.lines) {
      for (const c of ln.chords) {
        chordCount++;
        if (!c.valid) verbatim.push(c.raw);
      }
    }
  }
  // Rows with chords and no words: their chords render IN the line, at lyric size.
  const chordRows = ast.blocks
    .flatMap((b) => b.lines)
    .filter((l) => l.text.trim() === '' && l.chords.length > 0).length;
  const subLabels = ast.blocks
    .flatMap((b) => b.lines)
    .filter((l) => l.label !== undefined).length;
  // Every label as it will PRINT — the delimiter colon is already consumed, so a
  // sheet's `R:` written as `R:` surfaces here as a bare `R`. Without this the fix
  // loop has no way to see a lost colon.
  const labels = [];
  for (const b of ast.blocks) {
    if (b.label !== undefined) labels.push(b.label);
    for (const ln of b.lines) if (ln.label !== undefined) labels.push(ln.label);
  }

  return {
    title: ast.title,
    subtitle: ast.subtitle,
    blockCount: ast.blocks.length,
    chordCount,
    verbatim: [...new Set(verbatim)],
    chordRows,
    labels,
    subLabels,
    warnings: ast.warnings.map((w) => ({
      code: w.code,
      line: w.line,
      text: (srcLines[w.line] ?? '').trim(),
    })),
    cache: { title: ast.title ?? '', subtitle: ast.subtitle ?? '' },
  };
}
