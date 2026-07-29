import Translate from '@docusaurus/Translate';
import useIsBrowser from '@docusaurus/useIsBrowser';
import { useEffect, useState, type ReactNode } from 'react';

import {
  isRefusedByBrowser,
  readStats,
  writeStats,
} from '../../../lib/stats-consent';

import styles from './styles.module.css';

/**
 * The opt-in switch for the extra usage statistics, for use in a doc page.
 *
 * It reports its own state in words underneath, so the page proves what it says
 * rather than asking to be believed. Nothing is read until `useIsBrowser` turns
 * true: the docs are pre-rendered, and reading storage during the first render
 * would hydrate the wrong state and flash it.
 */
export default function StatsToggle(): ReactNode {
  const isBrowser = useIsBrowser();
  const [isOn, setIsOn] = useState(false);
  const [isRefused, setIsRefused] = useState(false);

  useEffect(() => {
    setIsOn(readStats());
    setIsRefused(isRefusedByBrowser());
  }, []);

  function onChange(isChecked: boolean): void {
    writeStats(isChecked);
    setIsOn(isChecked);
  }

  return (
    <div className={styles.toggle}>
      <label className={styles.row}>
        <input
          type="checkbox"
          role="switch"
          checked={isBrowser && isOn && !isRefused}
          disabled={!isBrowser || isRefused}
          onChange={(event) => onChange(event.target.checked)}
        />
        <Translate id="privacy.stats.label">
          Share anonymous usage statistics
        </Translate>
      </label>
      <p className={styles.state}>
        {!isBrowser ? (
          <>&nbsp;</>
        ) : isRefused ? (
          <Translate id="privacy.stats.state.refused">
            Your browser asks sites not to track you, so this stays off.
          </Translate>
        ) : isOn ? (
          <Translate id="privacy.stats.state.on">
            On, for this browser.
          </Translate>
        ) : (
          <Translate id="privacy.stats.state.off">
            Off, for this browser.
          </Translate>
        )}
      </p>
    </div>
  );
}
