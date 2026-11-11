// Where a song from a Song site is met — plans/import-chord-sheets.md phase 6
//
// A shell file, like `import-host.ts` beside it and for the same reason: the
// flow starts from more than one page, and only the shell may both inject the
// flow from data-access and mount dialogs from `app/shared`. It stands in for a
// presenter: it maps the flow's state into the dialogs' own vocabulary, renders
// the preview, and opens the editor once a song is imported.
//
// The two dialogs replace each other, never stack (Q18).

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { resolveSettings } from '@achordeon/shared/domain';
import {
  ParserService,
  RenderService,
  SettingsStore,
  SongSiteFlow,
} from '@achordeon/shared/data-access';
import { UiStore } from './shared/layout';
import { SongPreviewDialog, SongSiteDialog } from './shared/song-site';
import type { SongSitePick, SongSiteResultGroup } from './shared/song-site';

@Component({
  selector: 'app-song-site-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SongPreviewDialog, SongSiteDialog],
  template: `
    @if (flow.isOpen()) {
      @if (preview(); as preview) {
        <app-song-preview-dialog
          [title]="preview.song.title"
          [artist]="preview.song.artist"
          [siteName]="siteName(preview.song.site)"
          [url]="preview.song.url"
          [versions]="versionLabels()"
          [version]="preview.version"
          [svg]="svg()"
          [ratio]="ratio()"
          [isDark]="ui.isSongDark()"
          (versionChosen)="flow.chooseVersion($event)"
          (back)="flow.back()"
          (imported)="importSong()"
          (closed)="flow.close()"
        />
      } @else {
        <app-song-site-dialog
          [query]="flow.query()"
          [urlHints]="urlHints()"
          [groups]="groups()"
          [failure]="flow.failure()"
          [isBusy]="flow.isBusy()"
          (submitted)="flow.submit($event)"
          (chosen)="choose($event)"
          (closed)="flow.close()"
        />
      }
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class SongSiteHost {
  protected readonly flow = inject(SongSiteFlow);
  protected readonly ui = inject(UiStore);
  private readonly renderer = inject(RenderService);
  private readonly parser = inject(ParserService);
  private readonly settings = inject(SettingsStore);
  private readonly router = inject(Router);

  /** The preview, only while it is the view: Back leaves it in the flow. */
  protected readonly preview = computed(() =>
    this.flow.view() === 'preview' ? this.flow.preview() : null,
  );

  protected readonly urlHints = computed(() =>
    this.flow.sites().map((site) => site.urlHint),
  );

  protected readonly groups = computed<SongSiteResultGroup[] | null>(() => {
    const groups = this.flow.groups();
    if (!groups) return null;
    return groups.map((group) => ({
      site: group.site,
      siteName: this.siteName(group.site),
      notice: group.groupError,
      results: group.results,
    }));
  });

  protected readonly versionLabels = computed(
    () => this.flow.preview()?.song.versions?.map((v) => v.label) ?? [],
  );

  /** The new song as it will print: the user's own defaults, no overrides. */
  private readonly plan = computed(() => {
    const preview = this.preview();
    if (!preview) return undefined;
    return this.renderer.layout(
      this.parser.parse(preview.content),
      resolveSettings(this.settings.global(), undefined, {}),
      { dark: this.ui.isSongDark() },
    );
  });

  protected readonly svg = computed(() => {
    const plan = this.plan();
    return plan ? this.renderer.emit(plan) : '';
  });

  protected readonly ratio = computed(() => {
    const box = this.plan()?.box;
    return box && box.height > 0 ? box.width / box.height : 210 / 297;
  });

  protected siteName(site: number): string {
    return this.flow.sites().find((s) => s.site === site)?.name ?? '';
  }

  protected choose(pick: SongSitePick): void {
    void this.flow.choose(pick.site, pick.id);
  }

  /** One new song, then the editor (Q20). */
  protected async importSong(): Promise<void> {
    const id = await this.flow.importSong();
    if (id) await this.router.navigate(['/songs', id, 'edit']);
  }
}
