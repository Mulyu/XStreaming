import React from 'react';
import {List} from 'react-native-paper';

type Props = {
  emoji?: string;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children?: React.ReactNode;
};

// A collapsible group of SettingItem rows. List.Accordion only stays
// interactive when `expanded` is driven from our own state -- passing it as a
// one-time initial value makes the library treat it as fully controlled and
// ignore taps (see its own handlePressAction: it only toggles internally when
// the `expanded` prop is undefined).
const SettingSection: React.FC<Props> = ({
  emoji,
  title,
  count,
  defaultOpen,
  children,
}) => {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <List.Accordion
      title={emoji ? `${emoji} ${title}` : title}
      description={typeof count === 'number' ? String(count) : undefined}
      expanded={open}
      onPress={() => setOpen(o => !o)}>
      {children}
    </List.Accordion>
  );
};

export default SettingSection;
