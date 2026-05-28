import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const projectJson = JSON.parse(
  readFileSync(resolve(projectRoot, 'project.json'), 'utf8'),
);

const i18n = projectJson.i18n ?? {};
const defaultLocale = i18n.sourceLocale?.code ?? 'en';
const locales = [defaultLocale, ...Object.keys(i18n.locales ?? {})];
const baseHref = projectJson.targets?.build?.options?.baseHref ?? '/';

const template = readFileSync(
  resolve(projectRoot, 'src/index.html.template'),
  'utf8',
);

const out = template
  .replaceAll('__ACHORDEON_LOCALES__', JSON.stringify(locales))
  .replaceAll('__ACHORDEON_DEFAULT_LOCALE__', JSON.stringify(defaultLocale))
  .replaceAll('__ACHORDEON_BASE_HREF__', JSON.stringify(baseHref));

writeFileSync(resolve(projectRoot, 'src/index.html'), out);
