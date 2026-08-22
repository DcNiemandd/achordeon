import MDXComponents from '@theme-original/MDXComponents';
import MDXImg from '@theme/MDXComponents/Img';

import AppLink from './AppLink';
import SongChallenge from './SongChallenge';
import SongPreview from './SongPreview';
import StatsToggle from './StatsToggle';

import type { MDXComponentsObject } from '@theme/MDXComponents';

const NewMDXComponents: MDXComponentsObject = {
  ...MDXComponents,
  Image: MDXImg,
  AppLink,
  SongChallenge,
  SongPreview,
  StatsToggle,
};

export default NewMDXComponents;
