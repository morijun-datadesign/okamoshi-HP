/**
 * venue-format.js
 * 実施日程・会場表示の共通ヘルパー（index.html / lp/index.html で共用）
 *
 * - escapeHtml: スプレッドシート由来のテキストを安全に innerHTML へ挿入する
 * - formatVenuePlaceHtml: 会場名のセル内改行（\n）を保持し、「※」以降の注釈を
 *   0.85em・text-slate-500 の控えめなスタイルで本体と分けて表示する
 *   （1行省略 truncate / ellipsis は使わない：DESIGN ルール）
 */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined || str === '') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatVenuePlaceHtml(placeText) {
    if (!placeText) return '';
    const text = String(placeText).trim();
    if (!text) return '';

    const noteClass = 'text-slate-500 font-normal leading-relaxed break-words whitespace-pre-line';
    const noteIdx = text.indexOf('※');
    if (noteIdx === -1) {
      return `<div class="break-words whitespace-pre-line">${escapeHtml(text)}</div>`;
    }

    const mainPart = text.substring(0, noteIdx).trim();
    const notePart = text.substring(noteIdx).trim();

    if (!mainPart) {
      return `<div class="${noteClass}" style="font-size: 0.85em;">${escapeHtml(notePart)}</div>`;
    }

    return `<div class="break-words whitespace-pre-line">${escapeHtml(mainPart)}</div>` +
      `<div class="${noteClass} mt-0.5" style="font-size: 0.85em;">${escapeHtml(notePart)}</div>`;
  }

  global.escapeHtml = escapeHtml;
  global.formatVenuePlaceHtml = formatVenuePlaceHtml;
})(window);
