import React from 'react';
import {NativeStreamScreenBase} from './index';

function NativePortraitStreamScreen(props: any) {
  return <NativeStreamScreenBase {...props} portraitMode={true} />;
}

export default NativePortraitStreamScreen;
