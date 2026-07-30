import MDXComponents from '@theme-original/MDXComponents';
import MDXImg from '@theme/MDXComponents/Img';

import AppLink from './AppLink';
import StatsToggle from './StatsToggle';

import type { MDXComponentsObject } from '@theme/MDXComponents';

const NewMDXComponents: MDXComponentsObject = {
  ...MDXComponents,
  Image: MDXImg,
  AppLink,
  StatsToggle,
};

export default NewMDXComponents;
