import React from 'react';
import {useHarmonyNotice} from './model/useHarmonyNotice';
import HarmonyNoticeModal from './ui/HarmonyNoticeModal';

function HarmonyNotice() {
  const vm = useHarmonyNotice();
  return <HarmonyNoticeModal {...vm} />;
}

export default HarmonyNotice;
