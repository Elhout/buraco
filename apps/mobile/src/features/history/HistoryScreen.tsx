import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { EmptyState, Screen, Text } from '@/components/ui'
import { useUserId } from '@/features/auth/SessionProvider'
import { useCurrentClub } from '@/features/clubs/ClubProvider'
import { useClubMembers } from '@/features/clubs/members'
import { color, space } from '@/theme/tokens'
import { useHistory } from './api'
import { FiltersBar } from './FiltersBar'
import { DEFAULT_FILTERS, type HistoryFilters, activeFilterCount, filtersToParams, parseFilters } from './filters'
import { HistoryCard } from './HistoryCard'
import { ErrorBlock, LoadingBlock } from './ui'

type HistoryQuery = ReturnType<typeof useHistory>

/** Loading, error, or empty (with or without filters) instead of the list. */
function ListEmpty({ history, filtered }: { history: HistoryQuery; filtered: boolean }) {
  const { t } = useTranslation(['history', 'common'])
  if (history.isPending) return <LoadingBlock />
  if (history.isError) return <ErrorBlock error={history.error} onRetry={() => void history.refetch()} />
  return (
    <EmptyState
      icon="time-outline"
      title={filtered ? t('empty.filteredTitle') : t('empty.title')}
      body={filtered ? t('empty.filteredBody') : t('empty.body')}
    />
  )
}

/** Next-page spinner, or an end marker once every game is loaded. */
function ListFooter({ history }: { history: HistoryQuery }) {
  const { t } = useTranslation(['history', 'common'])
  if (history.isFetchingNextPage) {
    return (
      <View style={styles.footer} accessibilityLabel={t('loadingMore')}>
        <ActivityIndicator color={color.inkMuted} />
      </View>
    )
  }
  if (history.items.length === 0 || history.hasNextPage) return null
  return (
    <Text variant="caption" tone={color.inkFaint} center style={styles.footer}>
      {t('end')}
    </Text>
  )
}

/** History tab: the club timeline of finished games, newest first, filterable via the URL. */
export function HistoryScreen() {
  const { t } = useTranslation(['history', 'common'])
  const me = useUserId()
  const { club } = useCurrentClub()
  const params = useLocalSearchParams()
  const filters = parseFilters(params)
  const { members } = useClubMembers(club.id)
  const history = useHistory(club.id, filters, me, club.season_start)

  const setFilters = (next: HistoryFilters): void => router.setParams(filtersToParams(next))
  const filtered = activeFilterCount(filters) > 0

  return (
    <Screen title={t('title')} subtitle={t('subtitle', { club: club.name })} scroll={false} contentStyle={styles.content}>
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        members={members}
        seasonStart={club.season_start}
        clear={() => setFilters(DEFAULT_FILTERS)}
      />
      <FlatList
        data={history.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <HistoryCard item={item} onPress={() => router.push(`/history/${item.id}`)} />}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={<ListEmpty history={history} filtered={filtered} />}
        ListFooterComponent={<ListFooter history={history} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage()
        }}
        refreshControl={
          <RefreshControl
            tintColor={color.ink}
            refreshing={history.isRefetching && !history.isFetchingNextPage}
            onRefresh={() => void history.refetch()}
          />
        }
        contentContainerStyle={styles.list}
        style={styles.flex}
      />
    </Screen>
  )
}

function Separator() {
  return <View style={styles.separator} />
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 0, gap: space.md },
  list: { paddingBottom: space.xxxl },
  separator: { height: space.md },
  footer: { paddingVertical: space.xl },
})
