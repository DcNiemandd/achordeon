// Keyboard shortcuts — the stack of layers
// Spec: docs/adr/0015-keyboard-shortcuts-avoid-the-browsers-key-space.md

import { type Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogStack } from '../../primitives';
import { ShortcutRegistry } from './shortcut-registry';
import type { ShortcutAction, ShortcutLayer } from './shortcut';

function layer(
  name: string,
  actions: readonly ShortcutAction[],
  isBlocking = false,
): ShortcutLayer {
  return {
    name,
    actions: signal(actions) as Signal<readonly ShortcutAction[]>,
    isBlocking,
  };
}

function type(
  key: string,
  init: Partial<KeyboardEventInit> = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    cancelable: true,
    bubbles: true,
    ...init,
  });
  document.dispatchEvent(event);
  return event;
}

describe('ShortcutRegistry', () => {
  let registry: ShortcutRegistry;
  let ran: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    registry = TestBed.inject(ShortcutRegistry);
    ran = [];
  });

  afterEach(() => TestBed.resetTestingModule());

  const action = (
    id: string,
    keys: readonly string[],
    extra: Partial<ShortcutAction> = {},
  ): ShortcutAction => ({
    id,
    label: id,
    keys,
    run: () => ran.push(id),
    ...extra,
  });

  it('runs a registered press and takes the key from the browser', () => {
    registry.add(layer('Editor', [action('insert', ['Alt+KeyC'])]));

    const event = type('ç', { code: 'KeyC', altKey: true });

    expect(ran).toEqual(['insert']);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does nothing once the layer is gone', () => {
    const only = layer('Editor', [action('insert', ['Alt+KeyC'])]);
    registry.add(only);
    registry.remove(only);

    type('c', { code: 'KeyC', altKey: true });

    expect(ran).toEqual([]);
  });

  // The whole point: the settings dialog's Escape beats the editor's without
  // either of them knowing the other exists.
  it('gives the key to the topmost layer that wants it', () => {
    registry.add(layer('Editor', [action('leave', ['Escape'])]));
    registry.add(layer('Settings', [action('close', ['Escape'])]));

    type('Escape', { code: 'Escape' });

    expect(ran).toEqual(['close']);
  });

  it('lets a dialog shadow the screen it covers', () => {
    registry.add(layer('Stage', [action('next', ['ArrowRight'])]));
    registry.add(layer('Summary', [action('close', ['Escape'])], true));

    type('ArrowRight', { code: 'ArrowRight' });

    expect(ran).toEqual([]);
  });

  it('claims a greyed-out key rather than letting it fall through', () => {
    registry.add(layer('Page', [action('elsewhere', ['Alt+KeyC'])]));
    registry.add(
      layer('Editor', [action('insert', ['Alt+KeyC'], { isDisabled: true })]),
    );

    type('c', { code: 'KeyC', altKey: true });

    expect(ran).toEqual([]);
  });

  it('leaves a press alone once someone nearer the key has taken it', () => {
    registry.add(layer('Editor', [action('leave', ['Escape'])]));

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    event.preventDefault();
    document.dispatchEvent(event);

    expect(ran).toEqual([]);
  });

  // Enter on a confirmation's Delete button must not also open whatever the
  // list behind the dialog had current.
  it('leaves Enter to the button that has focus', () => {
    registry.add(layer('List', [action('open', ['Enter'])]));
    const button = document.createElement('button');
    document.body.append(button);

    button.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(ran).toEqual([]);
    button.remove();
  });

  it('swallows keys while a dialog nobody claimed is open', () => {
    registry.add(layer('List', [action('create', ['KeyN'])]));
    const release = TestBed.inject(DialogStack).claim();

    type('n', { code: 'KeyN' });
    expect(ran).toEqual([]);

    release();
    type('n', { code: 'KeyN' });
    expect(ran).toEqual(['create']);
  });

  it('hands the keys to a dialog that did claim them', () => {
    registry.add(layer('List', [action('create', ['KeyN'])]));
    registry.add(layer('Confirm', [action('confirm', ['KeyY'])], true));
    TestBed.inject(DialogStack).claim();

    type('y', { code: 'KeyY' });

    expect(ran).toEqual(['confirm']);
  });

  describe('the leader chord', () => {
    beforeEach(() => {
      registry.add(
        layer('Anywhere', [
          action('songs', ['KeyG KeyS']),
          action('stage', ['KeyG KeyT']),
        ]),
      );
    });

    it('waits for the second key', () => {
      type('g', { code: 'KeyG' });
      expect(ran).toEqual([]);
      expect(registry.leader()).not.toBeNull();

      type('s', { code: 'KeyS' });
      expect(ran).toEqual(['songs']);
      expect(registry.leader()).toBeNull();
    });

    it('says what it is waiting for', () => {
      type('g', { code: 'KeyG' });

      expect(registry.leaderOptions().map((one) => one.action.id)).toEqual([
        'songs',
        'stage',
      ]);
    });

    it('is abandoned by Escape', () => {
      type('g', { code: 'KeyG' });
      type('Escape', { code: 'Escape' });

      expect(registry.leader()).toBeNull();
      expect(ran).toEqual([]);
    });

    it('swallows a second key that finishes nothing, rather than firing it', () => {
      registry.add(layer('List', [action('new', ['KeyN'])]));

      type('g', { code: 'KeyG' });
      type('n', { code: 'KeyN' });

      expect(ran).toEqual([]);
    });

    it('does not arm inside a text field — that is a letter being typed', () => {
      const field = document.createElement('input');
      document.body.append(field);
      field.focus();

      field.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'g',
          code: 'KeyG',
          bubbles: true,
          cancelable: true,
        }),
      );

      expect(registry.leader()).toBeNull();
      field.remove();
    });
  });
});
