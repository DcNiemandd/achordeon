import MDXComponents from '@theme-original/MDXComponents';
import MDXImg from '@theme/MDXComponents/Img';

import type { MDXComponentsObject } from '@theme/MDXComponents';

const NewMDXComponents: MDXComponentsObject = {
  ...MDXComponents,
  Image: MDXImg,
};

export default NewMDXComponents;
