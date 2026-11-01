import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronsUpDown, X } from 'lucide-react';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Checkbox } from '@/Components/ui/checkbox';
import {
    Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/Components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover';
import { cn } from '@/lib/utils';

interface GenreGroup {
    label: string;
    options: string[];
}

interface TagCategoryGroup {
    category: string;
    tags: string[];
}

interface GenreMultiSelectProps {
    value: string[];
    onChange: (next: string[]) => void;
    groups: GenreGroup[];
    placeholder: string;
    searchPlaceholder: string;
    emptyText: string;
    clearLabel: string;
    selectedLabel: (count: number) => string;
    /** AniList tags (from `tag_categories`), grouped by category — shown as a collapsible
     *  tree below the genre section, inside the same popover (not a separate button). */
    tagGroups?: TagCategoryGroup[];
    tagValue?: string[];
    onTagChange?: (next: string[]) => void;
    tagSectionLabel?: string;
}

/**
 * Typeable genre filter (fuzzy match via cmdk) + select several genres at once.
 * Used for the user Catalog filter — selected genres are shown as badges below the trigger
 * so they stay visible without reopening the popover.
 *
 * The TAG section (optional, `tagGroups`) lives in the same popover so the filter bar
 * doesn't get another button — categories are collapsible, but still fully rendered in the DOM
 * (only hidden via CSS when collapsed) so the search box above can still filter tags
 * inside collapsed categories.
 */
export function GenreMultiSelect({
    value, onChange, groups, placeholder, searchPlaceholder, emptyText, clearLabel, selectedLabel,
    tagGroups = [], tagValue = [], onTagChange, tagSectionLabel,
}: GenreMultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
        () => new Set(tagGroups.map((g) => g.category)),
    );
    const isSearching = search.trim() !== '';
    const totalSelected = value.length + tagValue.length;

    function toggle(genre: string) {
        onChange(value.includes(genre) ? value.filter((v) => v !== genre) : [...value, genre]);
    }

    function toggleTag(tag: string) {
        if (!onTagChange) return;
        onTagChange(tagValue.includes(tag) ? tagValue.filter((v) => v !== tag) : [...tagValue, tag]);
    }

    function toggleCategory(category: string) {
        setCollapsedCategories((prev) => {
            const next = new Set(prev);
            next.has(category) ? next.delete(category) : next.add(category);
            return next;
        });
    }

    return (
        <div className="flex flex-col gap-1.5">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                    render={<Button type="button" variant="outline" size="sm" className="w-44 justify-between font-normal" />}
                >
                    <span className="truncate">{totalSelected > 0 ? selectedLabel(totalSelected) : placeholder}</span>
                    <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                    <Command>
                        <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
                        <CommandList>
                            <CommandEmpty>{emptyText}</CommandEmpty>
                            {groups.map((group, idx) => group.options.length > 0 && (
                                <div key={group.label}>
                                    {idx > 0 && <CommandSeparator />}
                                    <CommandGroup heading={group.label}>
                                        {group.options.map((g) => (
                                            <CommandItem key={g} value={g} onSelect={() => toggle(g)}>
                                                <Checkbox checked={value.includes(g)} onCheckedChange={() => toggle(g)} className="pointer-events-none" />
                                                <span>{g}</span>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </div>
                            ))}

                            {tagGroups.length > 0 && (
                                <>
                                    <CommandSeparator />
                                    <CommandGroup heading={tagSectionLabel}>
                                        {tagGroups.map((tg) => {
                                            const isCollapsed = !isSearching && collapsedCategories.has(tg.category);
                                            const selectedInCategory = tg.tags.filter((t) => tagValue.includes(t)).length;
                                            return (
                                                <div key={tg.category}>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleCategory(tg.category)}
                                                        className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm font-medium hover:bg-accent"
                                                    >
                                                        <span className="flex items-center gap-1.5">
                                                            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                                                            {tg.category}
                                                            {selectedInCategory > 0 && (
                                                                <Badge variant="secondary" className="h-4 px-1 text-[10px]">{selectedInCategory}</Badge>
                                                            )}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">{tg.tags.length}</span>
                                                    </button>
                                                    <div className={cn('ml-4', isCollapsed && 'hidden')}>
                                                        {tg.tags.map((tag) => (
                                                            <CommandItem key={tag} value={tag} onSelect={() => toggleTag(tag)}>
                                                                <Checkbox checked={tagValue.includes(tag)} onCheckedChange={() => toggleTag(tag)} className="pointer-events-none" />
                                                                <span>{tag}</span>
                                                            </CommandItem>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </CommandGroup>
                                </>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {totalSelected > 0 && (
                <div className="flex max-w-xs flex-wrap items-center gap-1">
                    {value.map((g) => (
                        <Badge key={`genre-${g}`} variant="secondary" className="gap-1 pr-1">
                            {g}
                            <button
                                type="button"
                                onClick={() => toggle(g)}
                                aria-label={g}
                                className="rounded-full hover:bg-muted-foreground/20"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                    {tagValue.map((tag) => (
                        <Badge key={`tag-${tag}`} variant="outline" className="gap-1 pr-1">
                            {tag}
                            <button
                                type="button"
                                onClick={() => toggleTag(tag)}
                                aria-label={tag}
                                className="rounded-full hover:bg-muted-foreground/20"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                    <button
                        type="button"
                        onClick={() => { onChange([]); onTagChange?.([]); }}
                        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                        {clearLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
