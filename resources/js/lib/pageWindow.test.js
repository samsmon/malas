// Run: node --test resources/js/lib/pageWindow.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageWindow } from './pageWindow.js';

test('total 1 shows only page 1', () => {
    assert.deepEqual(pageWindow(1, 1), [1]);
});

test('total 7 shows every number', () => {
    assert.deepEqual(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('total 8 starts windowing, one-page gap shows the number', () => {
    assert.deepEqual(pageWindow(1, 8), [1, 2, 3, '…', 8]);
    assert.deepEqual(pageWindow(4, 8), [1, 2, 3, 4, 5, '…', 8]);
});

test('first page of 17', () => {
    assert.deepEqual(pageWindow(1, 17), [1, 2, 3, '…', 17]);
});

test('middle page of 17', () => {
    assert.deepEqual(pageWindow(10, 17), [1, '…', 9, 10, 11, '…', 17]);
});

test('last page of 17', () => {
    assert.deepEqual(pageWindow(17, 17), [1, '…', 15, 16, 17]);
});

test('one skipped page is shown as a number, not an ellipsis', () => {
    assert.deepEqual(pageWindow(4, 10), [1, 2, 3, 4, 5, '…', 10]);
    assert.deepEqual(pageWindow(6, 10), [1, '…', 5, 6, 7, '…', 10]);
    assert.deepEqual(pageWindow(7, 10), [1, '…', 6, 7, 8, 9, 10]);
});

test('multi-page gap shows an ellipsis', () => {
    assert.ok(pageWindow(10, 17).includes('…'));
    assert.deepEqual(pageWindow(2, 17), [1, 2, 3, '…', 17]);
    assert.deepEqual(pageWindow(16, 17), [1, '…', 15, 16, 17]);
});

test('never more than 7 items for any page of a long list', () => {
    for (let c = 1; c <= 50; c++) {
        assert.ok(pageWindow(c, 50).length <= 7, `page ${c}`);
    }
});
