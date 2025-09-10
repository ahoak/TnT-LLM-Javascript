const parquet = require('@dsnp/parquetjs');
const fs = require('fs');
const path = require('path');
const { Tiktoken } = require( "js-tiktoken/lite")
const o200k_base = require( "js-tiktoken/ranks/o200k_base")

function unwrapParquetLists(obj) {
  if (Array.isArray(obj)) return obj.map(unwrapParquetLists);
  if (obj && typeof obj === 'object') {
    // unwrap LIST logical type
    if (obj.list && Array.isArray(obj.list)) {
      return obj.list.map(e => {
        // parquetjs nests element under .element
        const el = (e && typeof e === 'object' && 'element' in e) ? e.element : e;
        return unwrapParquetLists(el);
      });
    }
    // recurse other props
    for (const k of Object.keys(obj)) {
      obj[k] = unwrapParquetLists(obj[k]);
    }
  }
  return obj;
}


async function readParquetFile(filePath, recordLimit=null) {
let allRecords = [];
  try {
    const reader = await parquet.ParquetReader.openFile(filePath);
    const cursor = reader.getCursor();
    let record = null

    while ((record = await cursor.next())) {
      conversation = unwrapParquetLists(record.conversation);
      record.conversation = conversation;
      allRecords.push(record);
      if (recordLimit  && allRecords.length >= recordLimit){
        break;
      }
    }

    await reader.close();
  } catch (error) {
    console.error('Error reading Parquet file:', error);
  }
    return allRecords;
}



/**
 * Read all .parquet files under ./data and concatenate their row objects
 * NOTE: This loads everything into memory; for very large datasets consider a streaming / chunked approach instead.
 * @returns {Promise<Array<object>>} aggregated rows from all parquet files
 */
async function getParquetFiles(recordLimit=null) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        console.error('Data directory does not exist:', dataDir);
        return [];
    }
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.parquet'));
    if (files.length === 0) {
        console.error('No parquet files found in the data directory.');
        return [];
    }



    let allRows = [];
    for (const file of files) {
        const fullPath = path.join(dataDir, file);
        try {
            let file_data = await readParquetFile(fullPath, recordLimit)
            console.log(`Loaded ${fullPath}`);

            console.log(`${file_data.length} rows`);
            // allow to concatenate all rows from all files
            allRows = allRows.concat(file_data)
           
        } catch (err) {
            console.error('Failed to read parquet file', file, err.message || err);
        }
    }
    console.log(`Aggregated ${allRows.length} rows from ${files.length} parquet file(s).`);
    return allRows;
}

function splitIntoBatches(arr, batchCount) {
  if (!Number.isInteger(batchCount) || batchCount <= 0) throw new Error('batchCount must be a positive integer');
  const n = Math.min(batchCount, arr.length);
  const base = Math.floor(arr.length / n);
  let remainder = arr.length % n;
  const batches = [];
  let index = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    batches.push(arr.slice(index, index + size));
    index += size;
  }
  return batches;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function summariesToMarkdown(items) {
  return [
    '',
    ...items.map(it => `## ${it.id ?? it.conversation_hash ?? '(no id)'}\n${it.summary || '*<no summary>*'}`)
  ].join('\n');
}



// Lazy singleton so we don't rebuild the encoding each call
let _encoding;
function getEncoding() {
  if (!_encoding) {
    _encoding = new Tiktoken(o200k_base);
  }
  return _encoding;
}

/**
 * Truncate a string to at most maxTokens (cl100k_base), returning decoded text.
 * @param {string} str
 * @param {number} maxTokens
 * @param {object} [opts]
 * @param {boolean} [opts.addEllipsis=true] append an ellipsis when truncated
 * @param {boolean} [opts.returnMeta=false] return metadata instead of plain string
 * @returns {string|object}
 */
function truncateWithTiktoken(str, maxTokens, opts = {}) {
  const { addEllipsis = true, returnMeta = false } = opts;
  if (!str || typeof str !== 'string') return returnMeta ? { text: '', truncated: false } : '';
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    return returnMeta ? { text: str, truncated: false } : str;
  }

  const enc = getEncoding();
  const tokenIds = enc.encode(str);
  const over = tokenIds.length > maxTokens;

  let usedIds = over ? tokenIds.slice(0, maxTokens) : tokenIds;
  let text = enc.decode(usedIds);
  console.log(text)
  if (over && addEllipsis){
    text = text.trimEnd() + ' ...'; 
  } 

  if (returnMeta) {
    return {
      text,
      originalTokenCount: tokenIds.length,
      finalTokenCount: usedIds.length + (addEllipsis && over ? 1 : 0),
      truncated: over
    };
  }
  return text;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}


function writeJSONLStream(items, filePath) {
  ensureDir(path.dirname(filePath));
  const fd = fs.openSync(filePath, 'w');
  try {
    for (const it of items) {
      const line = JSON.stringify(it) + '\n';
      fs.writeSync(fd, line);
    }
  } finally {
    fs.closeSync(fd);
  }
  console.log(`[write] JSONL stream -> ${filePath}`);
}

// Define a constant for the text output format used in clustering prompts (OPTIONAL)
const TEXT_OUTPUT_FORMAT = `# Output:
  ## Please provide your answer between the tags: <category-id>your idenfied category id </category-id
  <category-name>your identified category name</category-name>
  <explanation>your explanation</explanation>
`



module.exports = { 
  getParquetFiles, 
  splitIntoBatches, 
  shuffleInPlace, 
  summariesToMarkdown, 
  truncateWithTiktoken, 
  writeJSONLStream, 
  TEXT_OUTPUT_FORMAT
};