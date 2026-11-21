// solve.js — a fast drop-in replacement for csv-reader 1.0.0.
//
// Returns, for one case's {text, header}, exactly the {columns, rows, errors}
// csv-reader 1.0.0 returns (see RULES.txt for the broken-row policy):
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it is one quote, each CRLF or lone CR inside it reads as LF;
//     what follows its closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk, when the field ends);
//   - a quote that never closes is a literal character, and the text after it
//     is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows are the
//     records after it, each padded with "" (short_row) or cut (long_row) to the
//     first record's width;
//   - each error is {code, line, row}, in the order met; line is the 1-based
//     line its record starts on, counting every LF, CRLF and lone CR inside
//     quotes, and row is its record's index in rows (null for the header).
//
// Speed: the text is read once, left to right, jumping between separators with
// indexOf instead of walking character by character. Fields are slices (V8
// sliced strings are views, not copies). The only scans that touch more than
// one field are the bounded ones inside a quoted field. No regex runs on the
// hot path, no per-character string building, no allocation per field beyond
// the field's own string and the rows/fields arrays the answer needs.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // next character to read
  let line = 1; // line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on, and the index in rows it
  // takes (null while the header is still unread).
  let recordLine = 1;
  let recordRow = null;

  // The field being read: its value, how it ended, and how many characters
  // the last unquoted read kept (quote_junk needs the count, not the value).
  let fv = '';
  let fe = END;
  let fa = 0;

  function err(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, appending to `init`.
  // Sets fv (value), fe (ended: COMMA, LINE_BREAK or END) and fa (chars kept).
  // A CR not followed by LF is dropped and reported (stray_cr); the field
  // goes on after it.
  function unquoted(init) {
    let value = init;
    let added = 0;
    for (;;) {
      const c = text.indexOf(',', pos);
      const n = text.indexOf('\n', pos);
      let m; // end of this segment: the nearer of the comma and the LF, else EOF
      let isLF;
      if (c !== -1 && (n === -1 || c < n)) {
        m = c;
        isLF = false;
      } else if (n !== -1) {
        m = n;
        isLF = true;
      } else {
        m = len;
        isLF = false;
      }
      // The segment [pos, m) holds no comma and no LF. A CR in it is either
      // the CRLF line break (only when it sits right before the LF at m) or a
      // stray CR. Check inside the slice only, so the search stays bounded by
      // the field instead of running to the next CR in the whole text.
      const chunk = text.slice(pos, m);
      if (chunk.indexOf('\r') === -1) {
        value += chunk;
        added += m - pos;
        if (isLF) {
          pos = m + 1;
          line += 1;
          fv = value;
          fe = LINE_BREAK;
          fa = added;
          return;
        }
        if (m === len) {
          pos = len;
          fv = value;
          fe = END;
          fa = added;
          return;
        }
        pos = m + 1;
        fv = value;
        fe = COMMA;
        fa = added;
        return;
      }
      // Slow path: one or more CRs inside [pos, m). Walk them; each is a
      // stray CR dropped with an error, except a CR right before the LF at m,
      // which is the CRLF line break.
      let start = pos;
      for (;;) {
        const r = text.indexOf('\r', start);
        if (r === -1 || r >= m) {
          value += text.slice(start, m);
          added += m - start;
          break;
        }
        value += text.slice(start, r);
        added += r - start;
        if (r + 1 === m && isLF) {
          pos = m + 1;
          line += 1;
          fv = value;
          fe = LINE_BREAK;
          fa = added;
          return;
        }
        err('stray_cr');
        start = r + 1;
      }
      if (isLF) {
        pos = m + 1;
        line += 1;
        fv = value;
        fe = LINE_BREAK;
        fa = added;
        return;
      }
      if (m === len) {
        pos = len;
        fv = value;
        fe = END;
        fa = added;
        return;
      }
      pos = m + 1;
      fv = value;
      fe = COMMA;
      fa = added;
      return;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fv / fe.
  function quoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    let nl = 0; // line breaks inside the quotes, counted but not yet applied
    // Appends text[a..b) to value, reading each CRLF or lone CR as one LF
    // and counting the line breaks it holds.
    function addSeg(a, b) {
      if (a >= b) return;
      const raw = text.slice(a, b);
      if (raw.indexOf('\n') === -1 && raw.indexOf('\r') === -1) {
        value += raw;
        return;
      }
      const conv = raw.replace(/\r\n?/g, '\n');
      let c = 0;
      let k = -1;
      while ((k = conv.indexOf('\n', k + 1)) !== -1) c++;
      nl += c;
      value += conv;
    }
    let seg = pos;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted (the line count restarts from
        // the opening quote, as the failed scan never happened).
        pos = open + 1;
        line = openLine;
        err('unterminated_quote');
        unquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one literal quote, and the field goes on.
        addSeg(seg, q);
        value += '"';
        pos = q + 2;
        seg = pos;
        continue;
      }
      addSeg(seg, q);
      line += nl;
      pos = q + 1;
      break;
    }
    // The field closed. What follows it decides how it ends.
    if (pos >= len) {
      fv = value;
      fe = END;
      return;
    }
    const ch = text.charCodeAt(pos);
    if (ch === 44) {
      pos += 1;
      fv = value;
      fe = COMMA;
      return;
    }
    if (ch === 10) {
      pos += 1;
      line += 1;
      fv = value;
      fe = LINE_BREAK;
      return;
    }
    if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fv = value;
      fe = LINE_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break; anything kept is quote_junk.
    unquoted(value);
    if (fa > 0) err('quote_junk');
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let qflag = false;
    do {
      qflag = text.charCodeAt(pos) === 34;
      if (qflag) quoted();
      else unquoted('');
      fields.push(fv);
    } while (fe === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !qflag) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? columns ?? [] : null, rows, errors };
}
