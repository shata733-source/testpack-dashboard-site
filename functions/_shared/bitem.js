import { json } from './auth.js';

export function clean(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  return String(v).replace(/\s+/g, ' ').trim();
}

export function norm(v) {
  return clean(v).toUpperCase();
}

export function isBlankLike(v) {
  const s = norm(v);
  return !s || s === '(BLANK)' || s === 'BLANK' || s === '-' || s === '--' || s === 'NULL' || s === 'N/A' || s === 'NA' || s === 'UNDEFINED';
}

export function rowVal(row, names) {
  if (!row) return '';
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null && clean(row[n]) !== '') return row[n];
  }
  const keys = Object.keys(row || {});
  for (const n of names) {
    const nn = norm(n).replace(/[^A-Z0-9]/g, '');
    const k = keys.find(x => norm(x).replace(/[^A-Z0-9]/g, '') === nn);
    if (k && row[k] !== undefined && row[k] !== null && clean(row[k]) !== '') return row[k];
  }
  return '';
}

export function tpNo(row) {
  return clean(rowVal(row, ['TP NUMBER', 'TestPackNo', 'Test Pack No', 'TestPack No', 'TP No', 'TestPackNo.']));
}

export function constructionStage(row) {
  return clean(rowVal(row, ['Construction Stage', 'Stage', 'Current Stage']));
}

export function punchCategory(row) {
  return norm(rowVal(row, ['Punch Category\n(A/B/C)', 'Punch Category (A/B/C)', 'Punch Category#(lf)(A/B/C)', 'Punch Category', 'Punch Catergory', 'Punch Catergory#(lf)(A/B/C)']));
}

export function punchClearedDate(row) {
  const v = rowVal(row, ['Punch Cleared', 'Punched Cleared', 'Punch Clear Date', 'Cleared Date']);
  return normalizeDate(v);
}

export function normalizeDate(v) {
  if (v === null || v === undefined || isBlankLike(v)) return '';
  if (typeof v === 'number' && isFinite(v)) {
    // Excel serial date, using UTC to avoid timezone shift.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = clean(v);
  // yyyy-mm-dd
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  // dd/mm/yyyy or dd-mm-yyyy
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

export function isAllowedBStage(stage) {
  const s = norm(stage);
  return [
    'QC PRETESTPACK PUNCH LIST',
    'RETURN FOR REINSTATEMENT',
    'RETURN WITH BACK PUNCH',
    'SAPID PUNCH LIST',
    'QC PUNCH LIST RETURN'
  ].includes(s);
}

export function isBItemRow(row) {
  return punchCategory(row) === 'B' && isAllowedBStage(constructionStage(row));
}

export const CCC_ALLOWED_AREAS = ['A211','A212','A222','A231','A232','A233'];
export const CCC_ALLOWED_AREA_LABELS = [...CCC_ALLOWED_AREAS, 'GENERAL'];

// Reinstatement Scope list supplied by Mohamed Shata for B Item ownership.
// Rule: outside this TP list = JGC Direct MP. Inside this list = CCC only when
// the B Item Area is one of A211/A212/A222/A231/A232/A233/GENERAL; otherwise JGC.
export const CCC_REINSTATEMENT_TPS = [
  "DPCU-FW-TP-033",
  "599-PC-01-TP-0001",
  "599-PC-01-TP-0002",
  "599-PC-01-TP-0003",
  "599-PC-01-TP-0004",
  "599-PC-01-TP-0006",
  "599-PC-01-TP-0007",
  "599-NT-01-TP-0092",
  "599-NT-01-TP-0116",
  "599-OW-01-TP-0220",
  "599-PC-01-TP-0029",
  "599-OW-01-TP-0510",
  "599-OW-01-TP-0521",
  "599-PC-01-TP-0035",
  "599-WG-01-TP-0110",
  "599-WG-01-TP-0107",
  "599-PC-01-TP-0036",
  "599-PC-01-TP-0037",
  "599-PC-01-TP-0040",
  "599-WG-01-TP-0056",
  "599-HS-01-TP-0524",
  "599-NT-01-TP-0533",
  "599-OW-01-TP-0527",
  "599-OW-01-TP-0536",
  "599-OW-01-TP-0537",
  "599-OW-01-TP-0359",
  "599-PR-01-TP-0098",
  "599-OW-01-TP-0129",
  "599-DG-01-TP-0902",
  "599-DG-01-TP-0903",
  "599-DG-01-TP-0905",
  "599-DG-01-TP-0906",
  "599-DG-01-TP-0907",
  "599-DG-01-TP-0923",
  "599-WG-01-TP-0113",
  "599-WG-01-TP-0114",
  "599-WG-01-TP-0115",
  "599-WG-01-TP-0120",
  "599-PC-01-TP-0001A",
  "599-WG-01-TP-0900",
  "599-PR-01-TP-0922",
  "599-PR-01-TP-0921",
  "599-PR-01-TP-0920",
  "599-PR-01-TP-0919",
  "599-PR-01-TP-0917",
  "599-DG-01-TP-0901",
  "599-WG-01-TP-0913",
  "599-PR-01-TP-0948",
  "599-PR-01-TP-0960",
  "599-PR-01-TP-0954",
  "599-PR-01-TP-0961",
  "599-PR-01-TP-0964",
  "599-FG-01-TP-1034",
  "599-SC-01-TP-0074",
  "599-FG-01-TP-1035",
  "599-DG-01-TP-0401",
  "599-SC-01-TP-0075",
  "599-OW-01-TP-1057",
  "599-OW-01-TP-1197",
  "599-OW-01-TP-0858",
  "599-OW-01-TP-0856",
  "599-OW-01-TP-1373",
  "599-OW-01-TP-1355",
  "599-OW-01-TP-0506",
  "599-OW-01-TP-0322",
  "599-FG-01-TP-0349",
  "599-NT-01-TP-0326",
  "599-OW-01-TP-0362",
  "599-WG-01-TP-0400",
  "599-OW-01-TP-0296",
  "599-OW-01-TP-0295",
  "599-OW-01-TP-0292",
  "599-OW-01-TP-0297",
  "599-PR-01-TP-1183",
  "599-PR-01-TP-1202",
  "599-WG-01-TP-1091",
  "599-DG-01-TP-0275",
  "DPCU-FW-TP-088",
  "599-NT-01-TP-1175",
  "599-PR-01-TP-0869",
  "599-NT-01-TP-1173",
  "599-PR-01-TP-1162",
  "599-FG-01-TP-1242",
  "599-DG-01-TP-1111",
  "599-PR-01-TP-0975",
  "599-NT-01-TP-1174",
  "599-PC-01-TP-0054",
  "599-WG-01-TP-1096",
  "599-WG-01-TP-1498",
  "599-WG-01-TP-0122",
  "599-WG-01-TP-1094",
  "599-PR-01-TP-1214",
  "599-PR-01-TP-1146",
  "599-WG-01-TP-1093",
  "599-PC-01-TP-1359",
  "599-PC-01-TP-1360",
  "599-DG-01-TP-0403",
  "599-OW-01-TP-0364",
  "599-PC-01-TP-1358",
  "599-WG-01-TP-1095",
  "599-PC-01-TP-1361",
  "599-PC-01-TP-1363",
  "599-PR-01-TP-1145",
  "599-PR-01-TP-1365",
  "599-DG-01-TP-1113",
  "599-DG-01-TP-1102",
  "599-PR-01-TP-1185",
  "599-PR-01-TP-1217",
  "599-PR-01-TP-1218",
  "599-OW-01-TP-0577",
  "599-PR-01-TP-0949",
  "599-UA-01-TP-1237",
  "599-IA-01-TP-1059",
  "599-IA-01-TP-1060",
  "599-IA-01-TP-1061",
  "599-IA-01-TP-1062",
  "599-IA-01-TP-1063",
  "599-IA-01-TP-1064",
  "599-IA-01-TP-1066",
  "599-IA-01-TP-1070",
  "599-IA-01-TP-1065",
  "599-IA-01-TP-1067",
  "599-IA-01-TP-1068",
  "599-FW-02-TP-1444",
  "599-FW-02-TP-1441",
  "599-FW-02-TP-1442",
  "599-FW-02-TP-1443",
  "599-FG-01-TP-0350",
  "599-DG-01-TP-1114",
  "599-DG-01-TP-0874",
  "599-DG-01-TP-1110",
  "599-DG-01-TP-0601",
  "599-WG-01-TP-0103",
  "599-WG-01-TP-0105",
  "599-WG-01-TP-0099",
  "599-WG-01-TP-0100",
  "599-WG-01-TP-0101",
  "599-WG-01-TP-0121",
  "599-WG-01-TP-0371",
  "599-WG-01-TP-0898",
  "599-WG-01-TP-0899",
  "599-WG-01-TP-1530",
  "599-DG-01-TP-1109",
  "599-DG-01-TP-1117",
  "599-DG-01-TP-1126",
  "599-DG-01-TP-1528",
  "599-OW-01-TP-1054",
  "599-OW-01-TP-1056",
  "599-OW-01-TP-0365",
  "599-OW-01-TP-0502",
  "599-OW-01-TP-0504",
  "599-OW-01-TP-0518",
  "599-OW-01-TP-0519",
  "599-OW-01-TP-0529",
  "599-HS-01-TP-1189",
  "599-SC-01-TP-0130",
  "599-SC-01-TP-0207",
  "599-SC-01-TP-0209",
  "599-SC-01-TP-0245",
  "599-SC-01-TP-0246",
  "599-SC-01-TP-0834",
  "599-SC-01-TP-0837",
  "599-SC-01-TP-0243",
  "599-SC-01-TP-0244",
  "599-SC-01-TP-0257",
  "599-SC-01-TP-0073",
  "599-PR-01-TP-0165",
  "599-PR-01-TP-0168",
  "599-PR-01-TP-1216",
  "599-PR-01-TP-1148",
  "599-PR-01-TP-1176",
  "599-PR-01-TP-0167",
  "599-PR-01-TP-0171",
  "599-PR-01-TP-0231",
  "599-PR-01-TP-0234",
  "599-PR-01-TP-0278",
  "599-PR-01-TP-0284",
  "599-PR-01-TP-0288",
  "599-PR-01-TP-0409",
  "599-PR-01-TP-0410",
  "599-PR-01-TP-0411",
  "599-PR-01-TP-0412",
  "599-PR-01-TP-0413",
  "599-PR-01-TP-0414",
  "599-PR-01-TP-0873",
  "599-PR-01-TP-0974",
  "599-PR-01-TP-1122",
  "599-PR-01-TP-0866",
  "599-PR-01-TP-0868",
  "599-PR-01-TP-1143",
  "599-PR-01-TP-1178",
  "599-WG-01-TP-1235",
  "599-WG-01-TP-1354",
  "599-DG-01-TP-0294",
  "599-PC-01-TP-1523",
  "599-PC-01-TP-1531",
  "599-RL-02-TP-0236",
  "599-FG-01-TP-1232",
  "599-FG-01-TP-1233",
  "599-FG-01-TP-1234",
  "599-PC-01-TP-0301",
  "599-PC-01-TP-0302",
  "599-PC-01-TP-1131",
  "599-PC-01-TP-1132",
  "599-DG-01-TP-1537",
  "599-PC-01-TP-1548",
  "599-PC-01-TP-0307",
  "599-PC-01-TP-0308",
  "599-PC-01-TP-1135",
  "599-OW-01-TP-1254",
  "599-FG-01-TP-1243",
  "599-FG-01-TP-0814",
  "599-FG-01-TP-0872",
  "599-FG-01-TP-0343",
  "599-FG-01-TP-0341",
  "599-FG-01-TP-0342",
  "599-FG-01-TP-1033",
  "599-FG-01-TP-1375",
  "599-WG-01-TP-0128",
  "599-WG-01-TP-0132",
  "599-WG-01-TP-0133",
  "599-PC-01-TP-1088",
  "599-RL-02-TP-0221",
  "599-HS-01-TP-1187",
  "599-HS-01-TP-1193",
  "599-HS-01-TP-1206",
  "599-WG-01-TP-0273",
  "599-NT-01-TP-0323",
  "599-NT-01-TP-0840",
  "599-NT-01-TP-1352",
  "599-NT-01-TP-0156",
  "599-NT-01-TP-0331",
  "599-NT-01-TP-0340",
  "599-NT-01-TP-1099",
  "599-NT-01-TP-0269",
  "599-NT-01-TP-0271",
  "599-NT-01-TP-0293",
  "599-NT-01-TP-0418",
  "599-NT-01-TP-0419",
  "599-NT-01-TP-1104",
  "599-NT-01-TP-1105",
  "599-NT-01-TP-1118",
  "599-NT-01-TP-0330",
  "599-NT-01-TP-1180",
  "599-WG-01-TP-0089",
  "599-WG-01-TP-0117",
  "599-WG-01-TP-0914",
  "599-WG-01-TP-1532",
  "599-DG-01-TP-1124",
  "599-DG-01-TP-1127",
  "599-DG-01-TP-1533",
  "599-WG-01-TP-0051",
  "599-DG-01-TP-1112",
  "599-PC-01-TP-1529",
  "599-PC-01-TP-1543",
  "599-PC-01-TP-0318",
  "599-PC-01-TP-1128",
  "599-PC-01-TP-0320",
  "599-OW-01-TP-0579",
  "599-OW-01-TP-0578",
  "599-SO-01-TP-0772",
  "599-PR-01-TP-0953",
  "599-PR-01-TP-0965",
  "599-PR-01-TP-0966",
  "599-PR-01-TP-1181",
  "599-PR-01-TP-1182",
  "599-PR-01-TP-1186",
  "599-PR-01-TP-1201",
  "599-PR-01-TP-1203",
  "599-PR-01-TP-1204",
  "599-PR-01-TP-1205",
  "599-IA-01-TP-1073",
  "599-FW-02-TP-1438",
  "599-FW-02-TP-1439",
  "599-FW-02-TP-1440",
  "599-FW-02-TP-1410",
  "599-FW-02-TP-1411",
  "599-FW-02-TP-1412",
  "599-FW-02-TP-1413",
  "599-FW-02-TP-1414",
  "599-FW-02-TP-1415",
  "599-FW-02-TP-1416",
  "599-FW-02-TP-1417",
  "599-FW-02-TP-1418",
  "599-FW-02-TP-1419",
  "599-FW-02-TP-1420",
  "599-FW-02-TP-1421",
  "599-FW-02-TP-1422",
  "599-FW-02-TP-1423",
  "599-FW-02-TP-1424",
  "599-FW-02-TP-1425",
  "599-FW-02-TP-1426",
  "599-FW-02-TP-1427",
  "599-FW-02-TP-1428",
  "599-FW-02-TP-1429",
  "599-FW-02-TP-1430",
  "599-FW-02-TP-1431",
  "599-FW-02-TP-1432",
  "599-FW-02-TP-1433",
  "599-FW-02-TP-1434",
  "599-FW-02-TP-1435",
  "599-FW-02-TP-1436",
  "599-FW-02-TP-1437",
  "599-OW-01-TP-0111",
  "599-HS-01-TP-1188",
  "599-HS-01-TP-1207",
  "599-WG-01-TP-1090",
  "599-PC-01-TP-1362",
  "599-PR-01-TP-0867",
  "599-PR-01-TP-1147",
  "DPCU-FW-TP-087",
  "DPCU-FW-TP-09",
  "DPCU-FW-TP-014",
  "DPCU-FW-TP-016",
  "DPCU-FW-TP-023",
  "DPCU-FW-TP-027",
  "DPCU-FW-TP-028",
  "DPCU-FW-TP-032",
  "DPCU-FW-TP-034",
  "DPCU-FW-TP-035",
  "DPCU-FW-TP-036",
  "DPCU-FW-TP-037",
  "DPCU-FW-TP-04",
  "DPCU-FW-TP-040",
  "DPCU-FW-TP-041",
  "DPCU-FW-TP-042",
  "DPCU-FW-TP-049",
  "DPCU-FW-TP-054",
  "DPCU-FW-TP-061",
  "DPCU-FW-TP-065",
  "DPCU-FW-TP-066",
  "DPCU-FW-TP-070",
  "DPCU-FW-TP-071",
  "DPCU-FW-TP-072",
  "DPCU-FW-TP-073",
  "DPCU-FW-TP-074",
  "DPCU-FW-TP-075",
  "DPCU-FW-TP-077",
  "DPCU-FW-TP-078",
  "DPCU-FW-TP-082",
  "DPCU-FW-TP-083",
  "DPCU-FW-TP-084",
  "DPCU-FW-TP-085",
  "DPCU-FW-TP-017",
  "DPCU-FW-TP-018",
  "DPCU-FW-TP-022",
  "DPCU-FW-TP-024",
  "DPCU-FW-TP-038",
  "DPCU-FW-TP-039",
  "DPCU-FW-TP-050",
  "DPCU-FW-TP-051",
  "DPCU-FW-TP-059",
  "DPCU-FW-TP-060",
  "DPCU-FW-TP-062",
  "DPCU-FW-TP-064",
  "DPCU-FW-TP-076",
  "DPCU-FW-TP-080",
  "DPCU-FW-TP-081",
  "DPCU-FW-TP-015",
  "DPCU-FW-TP-019",
  "DPCU-FW-TP-020",
  "DPCU-FW-TP-021",
  "DPCU-FW-TP-025",
  "DPCU-FW-TP-026",
  "DPCU-FW-TP-029",
  "DPCU-FW-TP-031",
  "DPCU-FW-TP-043",
  "DPCU-FW-TP-045",
  "DPCU-FW-TP-046",
  "DPCU-FW-TP-047",
  "DPCU-FW-TP-048",
  "DPCU-FW-TP-052",
  "DPCU-FW-TP-055",
  "DPCU-FW-TP-056",
  "DPCU-FW-TP-057",
  "DPCU-FW-TP-058",
  "DPCU-FW-TP-079",
  "DPCU-FW-TP-086",
  "599-PC-01-TP-1129",
  "599-PC-01-TP-1133",
  "599-PC-01-TP-0303",
  "599-IA-01-TP-1073K",
  "599-IA-01-TP-1073L",
  "599-IA-01-TP-1073S",
  "599-IA-01-TP-1073T",
  "599-IA-01-TP-1073U",
  "599-IA-01-TP-1073M",
  "599-IA-01-TP-1073B",
  "599-IA-01-TP-1073A",
  "599-IA-01-TP-1073E",
  "599-IA-01-TP-1073V",
  "599-IA-01-TP-1073F",
  "599-IA-01-TP-1073G",
  "599-IA-01-TP-1073I",
  "599-IA-01-TP-1073J",
  "599-IA-01-TP-1073Q",
  "599-IA-01-TP-1073H",
  "599-IA-01-TP-1073R",
  "599-IA-01-TP-1073N",
  "599-IA-01-TP-1073D",
  "599-IA-01-TP-1073O",
  "599-IA-01-TP-1073P",
  "599-IA-01-TP-1073C",
  "599-FW-02-TP-1696",
  "599-FW-02-TP-1697",
  "599-FW-02-TP-1698",
  "599-FW-02-TP-1699",
  "599-FW-02-TP-1700",
  "599-IA-01-TP-1073W",
  "599-PR-01-TP-1716",
  "599-PR-01-TP-1724",
  "599-RL-02-TP-0236A",
  "599-SC-01-TP-0251A",
  "599-WG-01-TP-1731",
  "599-NT-01-TP-0156A",
  "599-PR-01-TP-1143A",
  "599-RL-02-TP-1735",
  "599-WG-01-TP-0100A",
  "599-WG-01-TP-0100B",
  "599-WG-01-TP-0100C",
  "599-DG-01-TP-1109A",
  "599-DG-01-TP-1109B",
  "599-DG-01-TP-1109C",
  "599-DG-01-TP-1109D",
  "599-PR-01-TP-0869A",
  "599-UA-01-TP-1237A",
  "599-WG-01-TP-0104A",
  "599-NT-01-TP-1736",
  "599-PR-01-TP-1146R1"
];
const CCC_REINSTATEMENT_TP_SET = new Set(CCC_REINSTATEMENT_TPS.map(norm));

export function isCccReinstatementTp(tp) {
  return CCC_REINSTATEMENT_TP_SET.has(norm(tp));
}

export function hasAllowedCccAreaText(text) {
  const s = norm(text);
  return CCC_ALLOWED_AREAS.some(a => s.includes(a));
}

export function isGeneralAreaText(text) {
  return norm(text) === 'GENERAL';
}

export function isAllowedCccBItemArea(row) {
  const a = rowArea(row);
  return isGeneralAreaText(a) || hasAllowedCccAreaText(a);
}

export function deriveContractor(row) {
  // B Item / Reinstatement ownership rule:
  // 1) If TP is not in the approved Reinstatement CCC TP list, it is JGC Direct MP.
  // 2) If TP is in the list, only comments in A211/A212/A222/A231/A232/A233/GENERAL stay CCC.
  // 3) Any other area remains JGC Direct MP.
  if (!isCccReinstatementTp(tpNo(row))) return 'JGC';
  if (isAllowedCccBItemArea(row)) return 'CCC';
  return 'JGC';
}

export function commentText(row) {
  return clean(rowVal(row, ['Comments', 'Punch Description', 'PunchDesc', 'Comment', 'Punch Item']));
}

export function materialType(row) {
  return clean(rowVal(row, ['Material TYPE', 'Material Type', 'Punch Item Type', 'PunchTypeDescription']));
}

export function isoOrSpool(row) {
  // ISO / Spool only. Do NOT fall back to Sheet No. here, because Sheet No. is
  // a separate identity key for B Item rows.
  return clean(rowVal(row, ['ISO No.', 'ISO No', 'ISO', 'SpoolDwgNo', 'Spool Dwg No']));
}

export function sheetNo(row) {
  return clean(rowVal(row, ['Sheet No.', 'Sheet No', 'Sheet Number', 'Sheet', 'SheetNo']));
}

export function rowArea(row) {
  return clean(rowVal(row, ['Area', 'AREA', 'Drawing Areas']));
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function fingerprint(row) {
  // Stable matching key: do NOT include Punch Cleared date, because status may change.
  const parts = [
    deriveContractor(row),
    tpNo(row),
    constructionStage(row),
    punchCategory(row),
    // Sheet No. is part of the unique identity. The same TP/ISO/comment may exist
    // on different sheets and must remain separate B Items.
    sheetNo(row),
    commentText(row),
    materialType(row),
    isoOrSpool(row),
    rowArea(row)
  ].map(norm);
  return sha256Hex(parts.join('|'));
}

export function buildTpStatusMap(tpStatusByTP = {}) {
  const out = {};
  for (const [k, v] of Object.entries(tpStatusByTP || {})) {
    out[norm(k)] = v || {};
  }
  return out;
}

export function tpStatusDate(tpStatus, keys) {
  for (const k of keys) {
    const d = normalizeDate(tpStatus && tpStatus[k]);
    if (d) return { date: d, key: k };
  }
  return { date: '', key: '' };
}

export function queryCleared(row, tpStatusByTP = {}) {
  // FMS / CCC Excel Sheet Status is based ONLY on the Punch Cleared cell
  // in the B Item Excel row itself.
  // TP Summary is NOT part of the FMS/CCC Excel Sheet Status. It only affects
  // the final system status and creates a clear note for the user/admin.
  const pc = punchClearedDate(row);
  if (pc) {
    return {
      cleared: true,
      date: pc,
      stageClosed: false,
      stageDate: '',
      reasonKey: 'BITEM_PUNCH_CLEARED',
      reason: 'Punch Cleared date exists in the FMS / CCC Excel B Item row.',
      userNote: ''
    };
  }

  const stage = norm(constructionStage(row));
  const tp = norm(tpNo(row));
  const st = tpStatusByTP[tp] || {};

  let hit = { date: '', key: '' };
  if ([
    'QC PRETESTPACK PUNCH LIST',
    'RETURN FOR REINSTATEMENT',
    'RETURN WITH BACK PUNCH',
    'SAPID PUNCH LIST'
  ].includes(stage)) {
    hit = tpStatusDate(st, ['CNS_PUNCH_B_CLEARED', 'QC_PUNCH_LIST_RETURN']);
  } else if (stage === 'QC PUNCH LIST RETURN') {
    hit = tpStatusDate(st, ['QC_REINSTATEMENT_SIGN']);
  }

  if (hit.date) {
    return {
      cleared: false,
      date: '',
      stageClosed: true,
      stageDate: hit.date,
      reasonKey: 'TP_SUMMARY_STAGE_CLOSED',
      reason: `Closed by TP Summary stage date: ${hit.key}.`,
      userNote: 'Closed due to the closure of the current construction stage.'
    };
  }

  return {
    cleared: false,
    date: '',
    stageClosed: false,
    stageDate: '',
    reasonKey: 'OPEN_IN_FMS_CCC_EXCEL',
    reason: 'Not cleared in the FMS / CCC Excel B Item row and no closing TP Summary stage date was found.',
    userNote: ''
  };
}

export function finalDecision(existing, query) {
  const existingFinalCleared = existing && existing.final_status === 'CLEARED';
  const userCleared = existing && clean(existing.user_cleared_date);
  const stageClosed = !!(query && query.stageClosed);
  const fmsSheetCleared = !!(query && query.cleared);
  const effectiveCleared = fmsSheetCleared || stageClosed;
  const qNote = (query && query.userNote) || '';

  if (effectiveCleared && !existingFinalCleared && !userCleared) {
    return {
      finalStatus: 'CLEARED',
      finalDate: fmsSheetCleared ? (query.date || '') : (query.stageDate || ''),
      sourceFlag: stageClosed ? 'TP_SUMMARY_STAGE_CLOSED' : 'FMS_CCC_EXCEL_CLOSED',
      syncNote: qNote || 'Was open in system, but cleared in the latest FMS / CCC Excel source.'
    };
  }

  if (!effectiveCleared && (existingFinalCleared || userCleared)) {
    return {
      finalStatus: 'CLEARED',
      finalDate: existing.final_cleared_date || existing.user_cleared_date || '',
      sourceFlag: 'SYSTEM_CLOSED_FMS_CCC_EXCEL_NOT_CLEARED',
      syncNote: 'Closed in system/user edits, but not cleared in the latest FMS / CCC Excel source.'
    };
  }

  if (effectiveCleared && (existingFinalCleared || userCleared)) {
    return {
      finalStatus: 'CLEARED',
      finalDate: existing.final_cleared_date || existing.user_cleared_date || (fmsSheetCleared ? query.date : query.stageDate) || '',
      sourceFlag: stageClosed ? 'SAME_CLOSED_BY_TP_SUMMARY_STAGE' : 'SAME_CLOSED',
      syncNote: qNote || 'Same cleared status in both system and latest FMS / CCC Excel source.'
    };
  }

  return {
    finalStatus: 'OPEN',
    finalDate: '',
    sourceFlag: 'SAME_NOT_CLEARED',
    syncNote: 'Same not cleared status in both system and latest FMS / CCC Excel source.'
  };
}

export async function nextDisplayId(env, contractor, tp) {
  const c = contractor || 'JGC';
  const t = tp || 'NO-TP';
  const key = `${c}|${t}`;
  const existing = await env.DB.prepare('SELECT next_no FROM bitem_counters WHERE counter_key=?').bind(key).first();
  const next = existing ? Number(existing.next_no || 1) : 1;
  const newNext = next + 1;
  if (existing) {
    await env.DB.prepare('UPDATE bitem_counters SET next_no=?, updated_at=datetime(\'now\') WHERE counter_key=?').bind(newNext, key).run();
  } else {
    await env.DB.prepare('INSERT INTO bitem_counters(counter_key, contractor, tp_no, next_no, updated_at) VALUES(?,?,?,?,datetime(\'now\'))').bind(key, c, t, newNext).run();
  }
  return `${c}-B-${t}-C${String(next).padStart(3, '0')}`;
}

export function assertDB(env) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is not configured.' }, 500);
  return null;
}
