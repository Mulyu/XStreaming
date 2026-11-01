import React from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {AppButton} from '../../../shared/ui/Buttons';
import {alpha, palette} from '../../../shared/config/palette';
import type {OwnershipFilter} from '../model/libraryFilters';

type Props = {
  visible: boolean;
  onClose: () => void;
  t: (key: string) => string;
  // The phone shows the three services as chips under the search box already;
  // the TV has no such row, so its sheet carries them.
  showServices: boolean;
  filterXcloud: boolean;
  setFilterXcloud: (on: boolean) => void;
  filterGfn: boolean;
  setFilterGfn: (on: boolean) => void;
  filterPsPlus: boolean;
  setFilterPsPlus: (on: boolean) => void;
  // Hidden on the wishlist tab, where ownership is forced to "all".
  showOwnership: boolean;
  ownership: OwnershipFilter;
  setOwnership: (value: OwnershipFilter) => void;
  filterOnSale: boolean;
  setFilterOnSale: (on: boolean) => void;
  filterCatalog: boolean;
  toggleCatalog: () => void;
  onReset: () => void;
  isTV: boolean;
};

// Everything that narrows the list but doesn't change *which* list it is
// (the tabs do that): services, playable-or-not, on sale, included in a
// catalog. Names are written out on every option; a TV gets a panel from the
// right, a phone a sheet from the bottom.
const LibraryFilterSheet: React.FC<Props> = ({
  visible,
  onClose,
  t,
  showServices,
  filterXcloud,
  setFilterXcloud,
  filterGfn,
  setFilterGfn,
  filterPsPlus,
  setFilterPsPlus,
  showOwnership,
  ownership,
  setOwnership,
  filterOnSale,
  setFilterOnSale,
  filterCatalog,
  toggleCatalog,
  onReset,
  isTV,
}) => {
  const accent = palette.accent;
  const ownershipOptions: {value: OwnershipFilter; label: string}[] = [
    {value: 'owned', label: t('LibraryFilterOwned')},
    {value: 'notOwned', label: t('LibraryFilterNotOwned')},
    {value: 'all', label: t('LibraryOwnershipAll')},
  ];
  const backdrop = (
    // tv-focus-exempt: backdrop tap-to-dismiss; the show-results button is the focusable way out
    <Pressable style={styles.backdrop} onPress={onClose} />
  );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View
        style={[styles.overlay, isTV ? styles.overlayTv : styles.overlayPhone]}>
        {backdrop}
        <View style={[styles.sheet, isTV ? styles.sheetTv : styles.sheetPhone]}>
          <Text style={styles.heading}>{t('LibraryFilterTitle')}</Text>
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}>
            {showServices && (
              <View style={styles.group}>
                <Text style={styles.groupLabel}>
                  {t('LibraryFilterServices')}
                </Text>
                <View style={styles.options}>
                  <AppButton
                    fill
                    preferFocus={isTV}
                    label={t('LibraryFilterXcloud')}
                    accent={accent}
                    active={filterXcloud}
                    onPress={() => setFilterXcloud(!filterXcloud)}
                  />
                  <AppButton
                    fill
                    label={t('LibraryFilterGfn')}
                    accent={accent}
                    active={filterGfn}
                    onPress={() => setFilterGfn(!filterGfn)}
                  />
                  <AppButton
                    fill
                    label={t('LibraryFilterPsPlus')}
                    accent={accent}
                    active={filterPsPlus}
                    onPress={() => setFilterPsPlus(!filterPsPlus)}
                  />
                </View>
              </View>
            )}
            {showOwnership && (
              <View style={styles.group}>
                <Text style={styles.groupLabel}>
                  {t('LibraryFilterPlayable')}
                </Text>
                <View style={styles.options}>
                  {ownershipOptions.map(option => (
                    <AppButton
                      key={option.value}
                      fill
                      preferFocus={
                        isTV &&
                        !showServices &&
                        option.value === ownershipOptions[0].value
                      }
                      label={option.label}
                      accent={accent}
                      active={ownership === option.value}
                      onPress={() => setOwnership(option.value)}
                    />
                  ))}
                </View>
              </View>
            )}
            <View style={styles.group}>
              <View style={styles.options}>
                <AppButton
                  fill
                  preferFocus={isTV && !showServices && !showOwnership}
                  icon="tag-outline"
                  label={t('LibraryFilterOnSale')}
                  accent={accent}
                  active={filterOnSale}
                  onPress={() => setFilterOnSale(!filterOnSale)}
                />
                <AppButton
                  fill
                  icon="gift-outline"
                  label={t('LibraryFilterCatalog')}
                  accent={accent}
                  active={filterCatalog}
                  onPress={toggleCatalog}
                />
              </View>
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <AppButton
              icon="restore"
              label={t('Reset')}
              accent={accent}
              onPress={onReset}
            />
            <AppButton
              fill
              active
              label={t('LibraryFilterShowResults')}
              accent={accent}
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: alpha(palette.scrim, 0.6)},
  overlayTv: {flexDirection: 'row', justifyContent: 'flex-end'},
  overlayPhone: {justifyContent: 'flex-end'},
  backdrop: {...StyleSheet.absoluteFillObject},
  sheet: {backgroundColor: palette.surfaceHigh, padding: 18, gap: 14},
  sheetTv: {width: 380, height: '100%'},
  sheetPhone: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  heading: {fontSize: 18, fontWeight: '800'},
  body: {gap: 16, paddingBottom: 4},
  group: {gap: 8},
  groupLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    color: palette.textSoft,
  },
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  footer: {flexDirection: 'row', gap: 8, alignItems: 'center'},
});

export default LibraryFilterSheet;
