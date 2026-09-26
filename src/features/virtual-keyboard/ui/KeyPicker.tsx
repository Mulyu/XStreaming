import React from 'react';
import {View, StyleSheet, Pressable, Text, ScrollView} from 'react-native';
import {Portal, Modal, Card, Icon} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {KEY_CATEGORIES, PickableKey} from '../lib/virtualKeys';

const ACCENT = '#76B900';

export type KeyPickerProps = {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (key: PickableKey) => void;
};

const KeyPicker: React.FC<KeyPickerProps> = ({
  visible,
  onDismiss,
  onSelect,
}) => {
  const {t} = useTranslation();
  const [categoryIndex, setCategoryIndex] = React.useState(0);
  const category = KEY_CATEGORIES[categoryIndex];

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.header}>
              <Text style={styles.title}>{t('Add a key')}</Text>
              <Pressable style={styles.closeBtn} onPress={onDismiss}>
                <Icon source="close" size={14} color="#8a9a92" />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsScroll}>
              {KEY_CATEGORIES.map((cat, index) => (
                <Pressable
                  key={cat.name}
                  style={[
                    styles.tab,
                    index === categoryIndex && styles.tabActive,
                  ]}
                  onPress={() => setCategoryIndex(index)}>
                  <Text
                    style={[
                      styles.tabLabel,
                      index === categoryIndex && styles.tabLabelActive,
                    ]}>
                    {t(cat.name)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView style={styles.grid}>
              <View style={styles.gridInner}>
                {category.keys.map(k => (
                  <Pressable
                    key={`${k.vk}-${k.label}`}
                    style={styles.keyCell}
                    onPress={() => onSelect(k)}>
                    <Text style={styles.keyLabel} numberOfLines={1}>
                      {k.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    marginHorizontal: '12%',
  },
  card: {
    backgroundColor: 'rgba(12,15,13,0.98)',
    borderRadius: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#eef4ef',
  },
  closeBtn: {
    marginLeft: 'auto',
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsScroll: {
    flexGrow: 0,
    marginBottom: 10,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(238,244,239,0.16)',
    marginRight: 6,
  },
  tabActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8a9a92',
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: '#0a0f0c',
  },
  grid: {
    maxHeight: 260,
  },
  gridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keyCell: {
    width: 52,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(238,244,239,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#eef4ef',
  },
});

export default KeyPicker;
