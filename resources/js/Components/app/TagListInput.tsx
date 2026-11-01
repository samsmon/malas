import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Badge } from '@/Components/ui/badge';

interface TagListInputProps {
    value: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
}

/**
 * Free-form tag/genre editor (not from a fixed enum) — type then press Enter/comma to add, click X on a
 * badge to remove. Used for genres/authors/illustrators/themes/demographics in Series Edit,
 * fields that previously had no UI at all (they could only be filled via the initial import).
 */
export function TagListInput({ value, onChange, placeholder }: TagListInputProps) {
    const { t } = useTranslation('admin');
    const [draft, setDraft] = useState('');

    function commitDraft() {
        const tag = draft.trim();
        if (tag && !value.includes(tag)) {
            onChange([...value, tag]);
        }
        setDraft('');
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commitDraft();
        } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
        }
    }

    function removeTag(tag: string) {
        onChange(value.filter((v) => v !== tag));
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/50">
            {value.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        aria-label={t('series.removeTag', { tag })}
                        className="rounded-full hover:bg-muted-foreground/20"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </Badge>
            ))}
            <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitDraft}
                placeholder={value.length === 0 ? placeholder : ''}
                className="min-w-24 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
        </div>
    );
}
