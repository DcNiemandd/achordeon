import MDXComponents from '@theme-original/MDXComponents';
import MDXImg from '@theme/MDXComponents/Img';

import AppLink from './AppLink';
import SongPreview from './SongPreview';
import StatsToggle from './StatsToggle';

import type { MDXComponentsObject } from '@theme/MDXComponents';

const NewMDXComponents: MDXComponentsObject = {
  ...MDXComponents,
  Image: MDXImg,
  AppLink,
  SongPreview,
  StatsToggle,
};

export default NewMDXComponents;
