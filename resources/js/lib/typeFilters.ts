import { useTranslation } from 'react-i18next';

/**
 * Series type Segmented Control options, used on all series/collection list pages
 * (see the "type filter required" rule in CLAUDE.md). A single source of translations,
 * not duplicated per page.
 */
export function useTypeFilterOptions(): { value: string; label: string }[] {
    const { t } = useTranslation();
    return [
        { value: 'all', label: t('common.allTypes') },
        { value: 'manga', label: t('common.manga') },
        { value: 'novel', label: t('common.lightNovel') },
        { value: 'one_shot', label: t('common.oneShot') },
        { value: 'doujinshi', label: t('common.doujinshi') },
        { value: 'other', label: t('common.other') },
    ];
}
