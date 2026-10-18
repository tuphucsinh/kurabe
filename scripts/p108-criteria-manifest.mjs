#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';
import { computeAllSetHashes, buildPayload, getCounts, uuidV5 as strictUuidV5 } from './p108-import-criteria.mjs';

export const NAMESPACE = 'bdb8cc91-a1b0-5e76-807c-bf46cf444dc1';
export const PINNED_WORKBOOK_SHA256 = '3e3cfd7eddc18567eb3dfaaaf6586696044681fbfb337df845d043d884811743';
export const SOURCE_CELL_DIGEST = 'a64db222ded65e25014ff253bddda5dde65905de8a155078705e3fdd64fd5819';
export const G1_DECISION_REF = '.ai/DECISIONS_LOG.md: P108 G1 — FULL owner approval / T02 local execution; manifest NOT SIGNED';

/**
 * Deterministic UUIDv5 generator (RFC 9562 / RFC 4122) using SHA-1.
 * Delegates to strict uuidV5 in p108-import-criteria.mjs with default NAMESPACE.
 * @param {string} name
 * @param {string|Buffer} [namespace]
 * @returns {string} canonical 36-char lowercase UUID
 */
export function uuidV5(name, namespace = NAMESPACE) {
  return strictUuidV5(name, namespace);
}

/**
 * Computes deterministic digest of all non-empty cell values in workbook order.
 * @param {object} workbook
 * @returns {string} SHA-256 hex digest
 */
export function sourceCellDigest(workbook) {
  if (!workbook || !Array.isArray(workbook.SheetNames) || !workbook.Sheets) {
    throw new Error('REFUSE_INVALID_WORKBOOK: workbook must have SheetNames array and Sheets map');
  }
  const rows = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name] || {};
    for (const addr of Object.keys(sheet).filter((k) => !k.startsWith('!')).sort()) {
      const c = sheet[addr];
      if (c && c.v !== undefined && c.v !== null && String(c.v) !== '') {
        rows.push([name, addr, typeof c.v === 'number' ? 'n' : 's', String(c.v)]);
      }
    }
  }
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

/**
 * Serializes the manifest to stable JSON with 2-space indentation and trailing newline.
 * No absolute machine paths, current timestamps, or signed flags.
 * @param {object} manifest
 * @returns {string}
 */
export function serializeManifest(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}

/**
 * Low-level unverified manifest extraction from a parsed SheetJS workbook object.
 * For tests ONLY; leaves _metadata.workbook_sha256 as null.
 * @param {object} workbook SheetJS workbook with SheetNames and Sheets
 * @param {object} [opts]
 * @returns {object} complete manifest with _metadata (workbook_sha256: null) and groups
 */
export function extractManifestUnverified(workbook, opts = {}) {
  if (!workbook || !Array.isArray(workbook.SheetNames) || !workbook.Sheets) {
    throw new Error('REFUSE_INVALID_WORKBOOK: workbook must have SheetNames array and Sheets map');
  }

  // Validate change management sheets (007.01, 007.02, 007.03; cells A9, B9, G9)
  const changeSheetCodes = ['007.01', '007.02', '007.03'];
  let extractedRevision = null;
  let extractedEffectiveDate = null;
  let extractedRevisedDate = null;

  for (const code of changeSheetCodes) {
    const sheetName = workbook.SheetNames.find(
      (n) => n.toLowerCase().includes('thay đổi') && n.includes(code)
    );
    if (!sheetName || !workbook.Sheets[sheetName]) {
      throw new Error(`REFUSE_MISSING_CHANGE_METADATA: missing change sheet for ${code}`);
    }
    const s = workbook.Sheets[sheetName];
    const rawRev = s['A9']?.v;
    const rawRDate = s['B9']?.v;
    const rawEDate = s['G9']?.v;

    if (rawRev === undefined || rawRev === null || String(rawRev).trim() === '') {
      throw new Error(`REFUSE_MISSING_CHANGE_METADATA: sheet ${sheetName} cell A9 is missing or empty`);
    }
    if (rawRDate === undefined || rawRDate === null || String(rawRDate).trim() === '') {
      throw new Error(`REFUSE_MISSING_CHANGE_METADATA: sheet ${sheetName} cell B9 is missing or empty`);
    }
    if (rawEDate === undefined || rawEDate === null || String(rawEDate).trim() === '') {
      throw new Error(`REFUSE_MISSING_CHANGE_METADATA: sheet ${sheetName} cell G9 is missing or empty`);
    }

    const rev = String(rawRev).trim();
    const rDate = String(rawRDate).trim().replace(/\//g, '-');
    const eDate = String(rawEDate).trim().replace(/\//g, '-');

    if (rev !== '07') {
      throw new Error(`REFUSE_MISSING_CHANGE_METADATA: sheet ${sheetName} cell A9 revision must be 07, got ${rev}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rDate) || !/^\d{4}-\d{2}-\d{2}$/.test(eDate)) {
      throw new Error(`REFUSE_MISSING_CHANGE_METADATA: malformed dates in ${sheetName}`);
    }

    if (extractedRevision === null) {
      extractedRevision = rev;
      extractedRevisedDate = rDate;
      extractedEffectiveDate = eDate;
    } else {
      if (extractedRevision !== rev || extractedRevisedDate !== rDate || extractedEffectiveDate !== eDate) {
        throw new Error(`REFUSE_MISSING_CHANGE_METADATA: change sheets disagree on revision or dates`);
      }
    }
  }

  // Source content proof
  const cellDigest = sourceCellDigest(workbook);
  if (cellDigest !== SOURCE_CELL_DIGEST) {
    throw new Error(`REFUSE_SOURCE_CONTENT_MISMATCH: source cell digest ${cellDigest} does not match expected ${SOURCE_CELL_DIGEST}`);
  }

  const setDefinitions = [
    { key: 'leader', sheetMatch: /NV có chức vụ|007\.01/i, maxScore: 190 },
    { key: 'staff', sheetMatch: /Staff|007\.02/i, maxScore: 175 },
    { key: 'worker', sheetMatch: /Worker|007\.03/i, maxScore: 175 },
  ];

  const manifestGroups = [];

  for (const setDef of setDefinitions) {
    const sheetName = workbook.SheetNames.find(
      (n) => setDef.sheetMatch.test(n) && !n.toLowerCase().includes('thay đổi')
    );
    if (!sheetName || !workbook.Sheets[sheetName]) {
      throw new Error(`REFUSE_MISSING_SHEET: could not find criteria sheet for set ${setDef.key}`);
    }

    const sheet = workbook.Sheets[sheetName];
    const docCode = String(sheet['A1']?.v || '').trim();
    let jaRev = null;
    if (sheet['S2']?.v) {
      const match = String(sheet['S2'].v).match(/(\d+)/);
      jaRev = match ? match[1] : String(sheet['S2'].v).trim();
    }
    const isWorker = setDef.key === 'worker';
    const jaTextCol = isWorker ? 'K' : 'N';
    const jaNumCol = isWorker ? 'J' : 'M';
    const jaLevelCols = isWorker ? ['L', 'M', 'N', 'O', 'P'] : ['O', 'P', 'Q', 'R', 'S'];
    const viLevelCols = ['C', 'D', 'E', 'F', 'G'];
    const pointsCols = isWorker ? null : ['H', 'I', 'J', 'K', 'L'];

    let curGroup = null;
    let groupSortOrder = 0;

    for (let r = 1; r <= 60; r++) {
      const aVal = sheet['A' + r]?.v;

      // Group header detection (A-F)
      if (typeof aVal === 'string') {
        const gMatch = aVal.trim().match(/^([A-F])\.?$/);
        if (gMatch) {
          const groupCode = gMatch[1];
          const gNameVi = String(sheet['B' + r]?.v || '').trim();
          const gId = uuidV5(`p108:${setDef.key}:group:${groupCode}`);

          curGroup = {
            id: gId,
            set_key: setDef.key,
            code: groupCode,
            name: gNameVi,
            short_name: groupCode,
            sort_order: groupSortOrder++,
            source_sheet: sheetName,
            source_row: r,
            document_code: docCode,
            vi_cell: 'B' + r,
            ja_cell: `${jaTextCol}${r}`,
            raw_vi: sheet['B' + r]?.v,
            raw_ja: sheet[`${jaTextCol}${r}`]?.v,
            provenance: {
              source_sheet: sheetName,
              source_row: r,
              document_code: docCode,
              document_code_cell: 'A1',
              raw_document_code: sheet['A1']?.v,
              vi_cell: 'B' + r,
              ja_cell: `${jaTextCol}${r}`,
              raw_vi: sheet['B' + r]?.v,
              raw_ja: sheet[`${jaTextCol}${r}`]?.v,
              vi_code_cell: 'A' + r,
              ja_code_cell: `${jaNumCol}${r}`,
              raw_vi_code: sheet['A' + r]?.v,
              raw_ja_code: sheet[`${jaNumCol}${r}`]?.v,
              vi_revision: extractedRevision,
              ja_revision: jaRev,
              ...(setDef.key === 'leader' ? {
                stale_revision_header: {
                  vi_revision_cell: 'G2',
                  raw_vi_revision: sheet['G2']?.v,
                  ja_revision_cell: 'S2',
                  raw_ja_revision: sheet['S2']?.v,
                },
              } : {}),
            },
            criteria: [],
          };
          manifestGroups.push(curGroup);
          continue;
        }

        // Section G is unscored, stop criteria extraction
        if (/^G\.?$/.test(aVal.trim())) {
          break;
        }
      }

      // Criterion row detection (numeric column A)
      if (typeof aVal === 'number' && curGroup) {
        const viNum = aVal;
        const critCode = `${curGroup.code}${viNum}`;
        const cId = uuidV5(`p108:${setDef.key}:criterion:${critCode}`);
        const cNameVi = String(sheet['B' + r]?.v || '').trim();
        let cDescJa = String(sheet[jaTextCol + r]?.v || '').trim();
        if (critCode === 'A8') {
          cDescJa = '適切な運転免許証を所持しているか（50cc超のバイク・自動車で通勤する従業員、または会社送迎車の乗車地点までバイクで移動する従業員に適用）';
        }
        const rawJaNum = sheet[jaNumCol + r]?.v;
        const jaNumberDrift = (viNum !== rawJaNum && rawJaNum !== undefined)
          ? { vi_number: viNum, ja_number: rawJaNum }
          : null;

        const criterion = {
          id: cId,
          group_id: curGroup.id,
          set_key: setDef.key,
          code: critCode,
          name: cNameVi,
          description: cDescJa || null,
          weight: 0,
          default_level_index: null,
          sort_order: curGroup.criteria.length,
          source_sheet: sheetName,
          source_row: r,
          vi_cell: 'B' + r,
          ja_cell: `${jaTextCol}${r}`,
          raw_vi: sheet['B' + r]?.v,
          raw_ja: sheet[`${jaTextCol}${r}`]?.v,
          provenance: {
            source_sheet: sheetName,
            source_row: r,
            vi_cell: 'B' + r,
            ja_cell: `${jaTextCol}${r}`,
            raw_vi: sheet['B' + r]?.v,
            raw_ja: sheet[`${jaTextCol}${r}`]?.v,
            vi_number: viNum,
            ja_number: rawJaNum,
            ja_number_drift: jaNumberDrift,
            ...(critCode === 'A8' ? {
              aligned: true,
              aligned_description: '適切な運転免許証を所持しているか（50cc超のバイク・自動車で通勤する従業員、または会社送迎車の乗車地点までバイクで移動する従業員に適用）',
              decision_ref: G1_DECISION_REF,
            } : {}),
          },
          levels: [],
        };

        // Construct levels based on criterion code and G1 owner decisions
        if (critCode === 'A1') {
          // Attendance bands approved: >=99% (5), 98..<99% (4), 95..<98% (3), 93..<95% (2), <93% (1)
          const bands = [
            { vi: '>=99%', ja: '99%以上', points: 5 },
            { vi: '98..<99%', ja: '98%以上99%未満', points: 4 },
            { vi: '95..<98%', ja: '95%以上98%未満', points: 3 },
            { vi: '93..<95%', ja: '93%以上95%未満', points: 2 },
            { vi: '<93%', ja: '93%未満', points: 1 },
          ];

          for (let idx = 0; idx < 5; idx++) {
            const lId = uuidV5(`p108:${setDef.key}:level:A1:${idx}`);
            const viCell = viLevelCols[idx] + r;
            const jaCell = jaLevelCols[idx] + r;
            const pointsOrigin = isWorker
              ? `${viLevelCols[idx]}${curGroup.source_row} (Group A header)`
              : `${pointsCols[idx]}${r}`;

            criterion.levels.push({
              id: lId,
              criterion_id: cId,
              label: bands[idx].vi,
              description: bands[idx].ja,
              points: bands[idx].points,
              sort_order: idx,
              source_sheet: sheetName,
              source_row: r,
              vi_cell: viCell,
              ja_cell: jaCell,
              raw_vi: sheet[viCell]?.v,
              raw_ja: sheet[jaCell]?.v,
              points_origin: pointsOrigin,
              provenance: {
                source_sheet: sheetName,
                source_row: r,
                vi_cell: viCell,
                ja_cell: jaCell,
                raw_vi: sheet[viCell]?.v,
                raw_ja: sheet[jaCell]?.v,
                points_origin: 'G1_DECISION',
                decision_ref: G1_DECISION_REF,
                rule_id: 'A1',
                normalized_vi: bands[idx].vi,
                normalized_ja: bands[idx].ja,
                g1_rule: 'A1 attendance bands >=99%, 98..<99%, 95..<98%, 93..<95%, <93% points 5/4/3/2/1',
              },
            });
          }
        } else if (critCode === 'A4' || critCode === 'A5' || critCode === 'A6') {
          if (critCode === 'A4' && r !== 10) {
            throw new Error(`REFUSE_SOURCE_STRUCTURE: criterion A4 row mismatch: expected 10, got ${r}`);
          }
          if (critCode === 'A5' && r !== 11) {
            throw new Error(`REFUSE_SOURCE_STRUCTURE: criterion A5 row mismatch: expected 11, got ${r}`);
          }
          if (critCode === 'A6' && r !== 12) {
            throw new Error(`REFUSE_SOURCE_STRUCTURE: criterion A6 row mismatch: expected 12, got ${r}`);
          }
          // Penalties with counts on parent row 9 (cols D-G); col C '-' excluded
          const penalties = critCode === 'A4'
            ? [0, -15, -20, -25]
            : critCode === 'A5'
            ? [0, -5, -10, -15]
            : [0, -3, -6, -10];
          const countCols = ['D', 'E', 'F', 'G'];
          const jaCountCols = isWorker ? ['M', 'N', 'O', 'P'] : ['P', 'Q', 'R', 'S'];

          for (let idx = 0; idx < 4; idx++) {
            const lId = uuidV5(`p108:${setDef.key}:level:${critCode}:${idx}`);
            const countViCell = countCols[idx] + '9';
            const countJaCell = jaCountCols[idx] + '9';
            const penViCell = countCols[idx] + r;
            const penJaCell = jaCountCols[idx] + r;
            const countVi = String(sheet[countViCell]?.v || '').trim();
            const countJa = String(sheet[countJaCell]?.v || '').trim();
            const pointsOrigin = isWorker
              ? `G1 approved penalty points: ${penalties[idx]}`
              : `${['I', 'J', 'K', 'L'][idx]}${r}`;

            criterion.levels.push({
              id: lId,
              criterion_id: cId,
              label: countVi,
              description: countJa,
              points: penalties[idx],
              sort_order: idx,
              source_sheet: sheetName,
              source_row: r,
              vi_cell: penViCell,
              ja_cell: penJaCell,
              raw_vi: sheet[penViCell]?.v,
              raw_ja: sheet[penJaCell]?.v,
              points_origin: pointsOrigin,
              provenance: {
                source_sheet: sheetName,
                source_row: r,
                vi_cell: penViCell,
                ja_cell: penJaCell,
                raw_vi: sheet[penViCell]?.v,
                raw_ja: sheet[penJaCell]?.v,
                count_row: 9,
                count_vi_cell: countViCell,
                count_ja_cell: countJaCell,
                raw_count_vi: sheet[countViCell]?.v,
                raw_count_ja: sheet[countJaCell]?.v,
                points_origin: 'G1_DECISION',
                decision_ref: G1_DECISION_REF,
                rule_id: critCode,
                excluded_dash_cell: 'C' + r,
              },
            });
          }
        } else if (critCode === 'A7') {
          if (r !== 14) {
            throw new Error(`REFUSE_SOURCE_STRUCTURE: criterion A7 row mismatch: expected 14, got ${r}`);
          }
          // A7 Không đội mũ bảo hiểm: counts on row 14, penalties on row 13; col C '-' excluded
          const penalties = [0, -3, -6, -10];
          const countCols = ['D', 'E', 'F', 'G'];
          const jaCountCols = isWorker ? ['M', 'N', 'O', 'P'] : ['P', 'Q', 'R', 'S'];

          for (let idx = 0; idx < 4; idx++) {
            const lId = uuidV5(`p108:${setDef.key}:level:A7:${idx}`);
            const countViCell = countCols[idx] + '14';
            const countJaCell = jaCountCols[idx] + '14';
            const parentViCell = countCols[idx] + '13';
            const countVi = String(sheet[countViCell]?.v || '').trim();
            const rawJaVal = sheet[countJaCell]?.v;
            const countJa = String(rawJaVal || '').trim();
            const descJa = idx === 3 ? '3 回以上' : countJa;
            const pointsOrigin = isWorker
              ? `G1 approved penalty points: ${penalties[idx]} (row 13 / Leader I-L)`
              : `${['I', 'J', 'K', 'L'][idx]}14`;

            criterion.levels.push({
              id: lId,
              criterion_id: cId,
              label: countVi,
              description: descJa,
              points: penalties[idx],
              sort_order: idx,
              source_sheet: sheetName,
              source_row: 14,
              vi_cell: countViCell,
              ja_cell: countJaCell,
              raw_vi: sheet[countViCell]?.v,
              raw_ja: rawJaVal,
              points_origin: pointsOrigin,
              provenance: {
                source_sheet: sheetName,
                source_row: 14,
                vi_cell: countViCell,
                ja_cell: countJaCell,
                raw_vi: sheet[countViCell]?.v,
                raw_ja: rawJaVal,
                parent_penalty_row: 13,
                parent_vi_cell: parentViCell,
                raw_parent_vi: sheet[parentViCell]?.v,
                points_origin: 'G1_DECISION',
                decision_ref: G1_DECISION_REF,
                rule_id: 'A7',
                excluded_dash_cell: 'C14',
                note: 'A7 does not count as unexcused absence',
                ...(idx === 3 ? {
                  normalized_ja: '3 回以上',
                } : {}),
              },
            });
          }
        } else if (critCode === 'A8') {
          if (r !== 15) {
            throw new Error(`REFUSE_SOURCE_STRUCTURE: criterion A8 row mismatch: expected 15, got ${r}`);
          }
          // A8: Có (0), Không có (-3), N/A (0); collapses C15, F15, G15 into one explicit N/A
          const l0Id = uuidV5(`p108:${setDef.key}:level:A8:0`);
          const l1Id = uuidV5(`p108:${setDef.key}:level:A8:1`);
          const l2Id = uuidV5(`p108:${setDef.key}:level:A8:2`);
          const jaYesCell = isWorker ? 'M15' : 'P15';
          const jaNoCell = isWorker ? 'N15' : 'Q15';
          const jaDashCell = isWorker ? 'L15' : 'O15';

          // Level 0: Có
          criterion.levels.push({
            id: l0Id,
            criterion_id: cId,
            label: String(sheet['D15']?.v || '').trim(),
            description: String(sheet[jaYesCell]?.v || '').trim(),
            points: 0,
            sort_order: 0,
            source_sheet: sheetName,
            source_row: 15,
            vi_cell: 'D15',
            ja_cell: jaYesCell,
            raw_vi: sheet['D15']?.v,
            raw_ja: sheet[jaYesCell]?.v,
            points_origin: isWorker ? 'G1 approved: 0 points (Leader I15)' : 'I15',
            provenance: {
              source_sheet: sheetName,
              source_row: 15,
              vi_cell: 'D15',
              ja_cell: jaYesCell,
              raw_vi: sheet['D15']?.v,
              raw_ja: sheet[jaYesCell]?.v,
              points_origin: 'G1_DECISION',
              decision_ref: G1_DECISION_REF,
              rule_id: 'A8',
            },
          });

          // Level 1: Không có
          criterion.levels.push({
            id: l1Id,
            criterion_id: cId,
            label: String(sheet['E15']?.v || '').trim(),
            description: String(sheet[jaNoCell]?.v || '').trim(),
            points: -3,
            sort_order: 1,
            source_sheet: sheetName,
            source_row: 15,
            vi_cell: 'E15',
            ja_cell: jaNoCell,
            raw_vi: sheet['E15']?.v,
            raw_ja: sheet[jaNoCell]?.v,
            points_origin: isWorker ? 'G1 approved: -3 points (Leader J15)' : 'J15',
            provenance: {
              source_sheet: sheetName,
              source_row: 15,
              vi_cell: 'E15',
              ja_cell: jaNoCell,
              raw_vi: sheet['E15']?.v,
              raw_ja: sheet[jaNoCell]?.v,
              points_origin: 'G1_DECISION',
              decision_ref: G1_DECISION_REF,
              rule_id: 'A8',
            },
          });

          // Level 2: N/A
          criterion.levels.push({
            id: l2Id,
            criterion_id: cId,
            label: 'N/A',
            description: 'N/A',
            points: 0,
            sort_order: 2,
            source_sheet: sheetName,
            source_row: 15,
            vi_cell: 'C15',
            ja_cell: jaDashCell,
            raw_vi: sheet['C15']?.v,
            raw_ja: sheet[jaDashCell]?.v,
            points_origin: 'G1 approved: N/A 0 points; collapsed C15, F15, G15',
            provenance: {
              source_sheet: sheetName,
              source_row: 15,
              vi_cell: 'C15',
              ja_cell: jaDashCell,
              raw_vi: sheet['C15']?.v,
              raw_ja: sheet[jaDashCell]?.v,
              collapsed_cells: {
                vi: ['F15', 'G15'],
                ja: isWorker ? ['O15', 'P15'] : ['R15', 'S15'],
              },
              points_origin: 'G1_DECISION',
              decision_ref: G1_DECISION_REF,
              rule_id: 'A8',
              derived: true,
              normalized_vi: 'N/A',
              normalized_ja: 'N/A',
            },
          });
        } else if (critCode === 'C14') {
          if (r !== 25) {
            throw new Error(`REFUSE_SOURCE_STRUCTURE: criterion C14 row mismatch: expected 25, got ${r}`);
          }
          // C14: VI counts 4/3/2/1/0 -> points 5/4/3/2/1; JA aligned
          const alignedJa = ['4 回以上', '3 回', '2 回', '1 回', '0 回'];
          const pts = [5, 4, 3, 2, 1];

          for (let idx = 0; idx < 5; idx++) {
            const lId = uuidV5(`p108:${setDef.key}:level:C14:${idx}`);
            const viCell = viLevelCols[idx] + '25';
            const jaCell = jaLevelCols[idx] + '25';
            const pointsOrigin = isWorker
              ? `${viLevelCols[idx]}${curGroup.source_row} (Group C header)`
              : `${pointsCols[idx]}25`;

            criterion.levels.push({
              id: lId,
              criterion_id: cId,
              label: String(sheet[viCell]?.v || '').trim(),
              description: alignedJa[idx],
              points: pts[idx],
              sort_order: idx,
              source_sheet: sheetName,
              source_row: 25,
              vi_cell: viCell,
              ja_cell: jaCell,
              raw_vi: sheet[viCell]?.v,
              raw_ja: sheet[jaCell]?.v,
              points_origin: pointsOrigin,
              provenance: {
                source_sheet: sheetName,
                source_row: 25,
                vi_cell: viCell,
                ja_cell: jaCell,
                raw_vi: sheet[viCell]?.v,
                raw_ja: sheet[jaCell]?.v,
                aligned_ja: alignedJa[idx],
                points_origin: 'G1_DECISION',
                decision_ref: G1_DECISION_REF,
                rule_id: 'C14',
              },
            });
          }
        } else if (critCode === 'C15') {
          if (r !== 26) {
            throw new Error(`REFUSE_SOURCE_STRUCTURE: criterion C15 row mismatch: expected 26, got ${r}`);
          }
          // C15 proposals: 3/2/1/0 -> points 5/4/3/0; collapse F26 & G26 to 0 vụ / 0件
          const propCols = ['C', 'D', 'E'];
          const jaPropCols = isWorker ? ['L', 'M', 'N'] : ['O', 'P', 'Q'];
          const propPoints = [5, 4, 3];

          for (let idx = 0; idx < 3; idx++) {
            const lId = uuidV5(`p108:${setDef.key}:level:C15:${idx}`);
            const viCell = propCols[idx] + '26';
            const jaCell = jaPropCols[idx] + '26';
            const pointsOrigin = isWorker
              ? `${viLevelCols[idx]}${curGroup.source_row} (Group C header)`
              : `${pointsCols[idx]}26`;

            criterion.levels.push({
              id: lId,
              criterion_id: cId,
              label: String(sheet[viCell]?.v || '').trim(),
              description: String(sheet[jaCell]?.v || '').trim(),
              points: propPoints[idx],
              sort_order: idx,
              source_sheet: sheetName,
              source_row: 26,
              vi_cell: viCell,
              ja_cell: jaCell,
              raw_vi: sheet[viCell]?.v,
              raw_ja: sheet[jaCell]?.v,
              points_origin: pointsOrigin,
              provenance: {
                source_sheet: sheetName,
                source_row: 26,
                vi_cell: viCell,
                ja_cell: jaCell,
                raw_vi: sheet[viCell]?.v,
                raw_ja: sheet[jaCell]?.v,
                points_origin: 'G1_DECISION',
                decision_ref: G1_DECISION_REF,
                rule_id: 'C15',
              },
            });
          }

          // Level 3: zero proposals
          const l3Id = uuidV5(`p108:${setDef.key}:level:C15:3`);
          const zeroJaCell = isWorker ? 'O26' : 'R26';
          criterion.levels.push({
            id: l3Id,
            criterion_id: cId,
            label: '0 vụ',
            description: '0件',
            points: 0,
            sort_order: 3,
            source_sheet: sheetName,
            source_row: 26,
            vi_cell: 'F26',
            ja_cell: zeroJaCell,
            raw_vi: sheet['F26']?.v,
            raw_ja: sheet[zeroJaCell]?.v,
            points_origin: 'G1 approved: zero proposals 0 points (Leader/Staff K26 / collapsed F26, G26)',
            provenance: {
              source_sheet: sheetName,
              source_row: 26,
              vi_cell: 'F26',
              ja_cell: zeroJaCell,
              raw_vi: sheet['F26']?.v,
              raw_ja: sheet[zeroJaCell]?.v,
              collapsed_cells: {
                vi: ['G26'],
                ja: isWorker ? ['P26'] : ['S26'],
              },
              points_origin: 'G1_DECISION',
              decision_ref: G1_DECISION_REF,
              rule_id: 'C15',
              derived: true,
              normalized_vi: '0 vụ',
              normalized_ja: '0件',
            },
          });
        } else {
          // Ordinary criteria
          const pts = curGroup.code === 'F' ? [15, 12, 9, 6, 3] : [5, 4, 3, 2, 1];

          for (let idx = 0; idx < 5; idx++) {
            const lId = uuidV5(`p108:${setDef.key}:level:${critCode}:${idx}`);
            const viCell = viLevelCols[idx] + r;
            const jaCell = jaLevelCols[idx] + r;
            const pointsOrigin = isWorker
              ? `${viLevelCols[idx]}${curGroup.source_row} (Group ${curGroup.code} header)`
              : `${pointsCols[idx]}${r}`;

            let ptCell;
            let rawPt;
            if (isWorker) {
              const headerAddr = `${viLevelCols[idx]}${curGroup.source_row}`;
              ptCell = `${sheetName}!${headerAddr}`;
              rawPt = sheet[headerAddr]?.v;
              if (rawPt === undefined || rawPt === null) {
                throw new Error(`REFUSE_SOURCE_STRUCTURE: missing point cell ${ptCell}`);
              }
              const match = String(rawPt).match(/(-?\d+)/);
              const parsed = match ? parseInt(match[1], 10) : null;
              if (parsed !== pts[idx]) {
                throw new Error(`REFUSE_SOURCE_STRUCTURE: point cell value mismatch in ${ptCell}: expected ${pts[idx]}, got ${rawPt}`);
              }
            } else {
              const colAddr = `${pointsCols[idx]}${r}`;
              ptCell = `${sheetName}!${colAddr}`;
              rawPt = sheet[colAddr]?.v;
              if (rawPt === undefined || rawPt === null) {
                throw new Error(`REFUSE_SOURCE_STRUCTURE: missing point cell ${ptCell}`);
              }
              if (Number(rawPt) !== pts[idx]) {
                throw new Error(`REFUSE_SOURCE_STRUCTURE: point cell value mismatch in ${ptCell}: expected ${pts[idx]}, got ${rawPt}`);
              }
            }

            criterion.levels.push({
              id: lId,
              criterion_id: cId,
              label: String(sheet[viCell]?.v || '').trim(),
              description: String(sheet[jaCell]?.v || '').trim(),
              points: pts[idx],
              sort_order: idx,
              source_sheet: sheetName,
              source_row: r,
              vi_cell: viCell,
              ja_cell: jaCell,
              raw_vi: sheet[viCell]?.v,
              raw_ja: sheet[jaCell]?.v,
              points_origin: pointsOrigin,
              provenance: {
                source_sheet: sheetName,
                source_row: r,
                vi_cell: viCell,
                ja_cell: jaCell,
                raw_vi: sheet[viCell]?.v,
                raw_ja: sheet[jaCell]?.v,
                points_origin: 'WORKBOOK_CELL',
                points_cell: ptCell,
                points_raw: rawPt,
              },
            });
          }
        }

        curGroup.criteria.push(criterion);
      }
    }
  }

  // Structural asserts: per set exactly groups A..F, criteria counts 33/30/30 and codes sequential
  const expectedSetRules = [
    { key: 'leader', expectedCriteriaCount: 33 },
    { key: 'staff', expectedCriteriaCount: 30 },
    { key: 'worker', expectedCriteriaCount: 30 },
  ];

  for (const setRule of expectedSetRules) {
    const sGroups = manifestGroups.filter((g) => g.set_key === setRule.key);
    const gCodes = sGroups.map((g) => g.code);
    if (JSON.stringify(gCodes) !== JSON.stringify(['A', 'B', 'C', 'D', 'E', 'F'])) {
      throw new Error(`REFUSE_SOURCE_STRUCTURE: set ${setRule.key} groups must be exactly A..F in order, got ${JSON.stringify(gCodes)}`);
    }

    let sequentialNum = 1;
    for (const g of sGroups) {
      for (const c of g.criteria) {
        const expectedCode = `${g.code}${sequentialNum}`;
        if (c.code !== expectedCode) {
          throw new Error(`REFUSE_SOURCE_STRUCTURE: criterion code mismatch in set ${setRule.key}: expected ${expectedCode}, got ${c.code}`);
        }
        sequentialNum++;
      }
    }

    const totalSetCriteria = sequentialNum - 1;
    if (totalSetCriteria !== setRule.expectedCriteriaCount) {
      throw new Error(`REFUSE_SOURCE_STRUCTURE: set ${setRule.key} criteria count must be ${setRule.expectedCriteriaCount}, got ${totalSetCriteria}`);
    }
  }

  // Pre-calculate counts and maxima for verification
  const counts = getCounts({ groups: manifestGroups });
  const setHashes = computeAllSetHashes(buildPayload({ groups: manifestGroups }));
  const payloadSha256 = crypto.createHash('sha256')
    .update(JSON.stringify({ groups: manifestGroups }))
    .digest('hex');

  const maxima = {};
  for (const setDef of setDefinitions) {
    const gList = manifestGroups.filter((g) => g.set_key === setDef.key);
    let maxTotal = 0;
    for (const g of gList) {
      for (const c of g.criteria) {
        maxTotal += Math.max(...c.levels.map((l) => l.points));
      }
    }
    maxima[setDef.key] = maxTotal;
  }

  const manifest = {
    _metadata: {
      workbook_sha256: null,
      source_workbook: opts.source_workbook || 'TCDG2026.xls',
      uuid_namespace: NAMESPACE,
      revision: extractedRevision,
      effective_date: extractedEffectiveDate,
      revised_date: extractedRevisedDate,
      first_period: 'Kỳ 2026',
      period_frequency: 'yearly',
      g1_decision_ref: G1_DECISION_REF,
      counts: {
        leader: counts.leader,
        staff: counts.staff,
        worker: counts.worker,
        total_groups: counts.total_groups,
        total_criteria: counts.total_criteria,
      },
      maxima: {
        leader: maxima.leader,
        staff: maxima.staff,
        worker: maxima.worker,
      },
      payload_sha256: payloadSha256,
      set_hashes: setHashes,
    },
    groups: manifestGroups,
  };

  return manifest;
}

/**
 * Builds the canonical criteria manifest from raw workbook bytes.
 * Buffer.isBuffer required; validates raw SHA256 matches PINNED_WORKBOOK_SHA256,
 * parses with SheetJS, runs all content checks, and attaches pinned workbook_sha256.
 * @param {Buffer} rawBuffer Raw bytes of input workbook
 * @param {object} [opts]
 * @returns {object} complete manifest with _metadata and groups
 */
export function buildManifest(rawBuffer, opts = {}) {
  if (!Buffer.isBuffer(rawBuffer)) {
    throw new Error('REFUSE_INVALID_BUFFER: rawBuffer must be a Buffer');
  }

  const actualSha = crypto.createHash('sha256').update(rawBuffer).digest('hex');
  if (actualSha !== PINNED_WORKBOOK_SHA256) {
    throw new Error(
      `REFUSE_WORKBOOK_SHA_MISMATCH: expected pinned SHA256 ${PINNED_WORKBOOK_SHA256}, got ${actualSha}`
    );
  }

  const wb = xlsx.read(rawBuffer, { type: 'buffer' });
  const manifest = extractManifestUnverified(wb, opts);
  manifest._metadata.workbook_sha256 = PINNED_WORKBOOK_SHA256;
  return manifest;
}

/**
 * Command line entry point:
 * node scripts/p108-criteria-manifest.mjs --workbook ABS_PATH [--output ABS_PATH]
 */
export async function main(argv = process.argv.slice(2)) {
  let workbookPath = null;
  let outputPath = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workbook' || arg === '-w') {
      workbookPath = argv[++i];
    } else if (arg === '--output' || arg === '-o') {
      outputPath = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node p108-criteria-manifest.mjs --workbook ABS_PATH [--output ABS_PATH]

Options:
  --workbook, -w <path>    Path to input workbook file (required)
  --output, -o <path>      Path to output JSON file (optional, defaults to stdout)
  --help, -h               Show this help message
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!workbookPath) {
    throw new Error('REFUSE_MISSING_WORKBOOK_PATH: --workbook <path> is required');
  }

  const resolvedWb = path.resolve(workbookPath);
  if (!fs.existsSync(resolvedWb)) {
    throw new Error(`REFUSE_WORKBOOK_NOT_FOUND: workbook file not found at ${resolvedWb}`);
  }

  // Reject output path if identical to workbook or resolving to existing alias (symlink / hardlink)
  if (outputPath) {
    const resolvedOut = path.resolve(outputPath);
    if (resolvedWb === resolvedOut) {
      throw new Error(`REFUSE_OUTPUT_OVERWRITES_WORKBOOK: output path cannot be identical to workbook path: ${resolvedOut}`);
    }
    if (fs.existsSync(resolvedOut)) {
      try {
        const realWb = fs.realpathSync(resolvedWb);
        const realOut = fs.realpathSync(resolvedOut);
        if (realWb === realOut) {
          throw new Error(`REFUSE_OUTPUT_OVERWRITES_WORKBOOK: output path resolves to same realpath as workbook: ${resolvedOut}`);
        }
      } catch (err) {
        if (err.message.startsWith('REFUSE_OUTPUT_OVERWRITES_WORKBOOK')) throw err;
      }

      try {
        const statWb = fs.statSync(resolvedWb);
        const statOut = fs.statSync(resolvedOut);
        if (statWb.dev === statOut.dev && statWb.ino === statOut.ino) {
          throw new Error(`REFUSE_OUTPUT_OVERWRITES_WORKBOOK: output path shares device/inode with workbook: ${resolvedOut}`);
        }
      } catch (err) {
        if (err.message.startsWith('REFUSE_OUTPUT_OVERWRITES_WORKBOOK')) throw err;
      }
    }
  }

  // Read raw bytes and verify pinned SHA BEFORE xlsx parse or write
  const rawBytes = fs.readFileSync(resolvedWb);
  const actualSha = crypto.createHash('sha256').update(rawBytes).digest('hex');
  if (actualSha !== PINNED_WORKBOOK_SHA256) {
    throw new Error(
      `REFUSE_WORKBOOK_SHA_MISMATCH: expected pinned SHA256 ${PINNED_WORKBOOK_SHA256}, got ${actualSha}`
    );
  }

  const manifest = buildManifest(rawBytes, {
    source_workbook: path.basename(resolvedWb),
  });

  const serialized = serializeManifest(manifest);

  if (outputPath) {
    const resolvedOut = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, serialized, 'utf8');
  } else {
    process.stdout.write(serialized);
  }
}

// Import-main guard so tests can import without executing CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`ERROR: ${err.message || String(err)}`);
    process.exit(1);
  });
}
