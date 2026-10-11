/**
 * Windowed pagination: first/last page always, a window of 3 around the current page,
 * "…" only where 2+ pages are skipped (a single skipped page is shown as its number).
 *
 * @param {number} current 1-based current page
 * @param {number} total total pages
 * @returns {(number | '…')[]}
 */
export function pageWindow(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    let start = current - 1;
    let end = current + 1;
    if (current <= 2) {
        start = 1;
        end = 3;
    } else if (current >= total - 1) {
        start = total - 2;
        end = total;
    }

    const pages = new Set([1, total]);
    for (let p = start; p <= end; p++) pages.add(p);
    const sorted = [...pages].sort((a, b) => a - b);

    const out = [];
    sorted.forEach((p, i) => {
        const prev = sorted[i - 1];
        if (prev !== undefined && p - prev > 1) {
            out.push(p - prev === 2 ? p - 1 : '…');
        }
        out.push(p);
    });
    return out;
}
