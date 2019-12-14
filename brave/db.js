'use strict'

/**
 * @file
 * Functions for recording data to RDS.
 */
const AWSXRay = require('aws-xray-sdk-core');
const pgLib = AWSXRay.capturePostgres(require('pg'));

const braveDebugLib = require('./debug')
const braveHashLib = require('./hash')

let _config
try {
  _config = require('../config')
} catch (_) {
  _config = {
    pg: {
      username: process.env.PG_USERNAME,
      host: process.env.PG_HOSTNAME,
      password: process.env.PG_PASSWORD,
      port: process.env.PG_PORT
    }
  }
}

const _insertWithId = async (client, table, colToValueMap) => {
  const keys = []
  const values = []
  const queryPlaceHolders = []
  let queryPlaceHolderIndex = 0

  for (const [aKey, aValue] of Object.entries(colToValueMap)) {
    queryPlaceHolderIndex += 1
    keys.push(aKey)
    values.push(aValue)
    queryPlaceHolders.push('$' + queryPlaceHolderIndex.toString())
  }

  const insertQuery = `INSERT INTO ${table}(${keys.join(',')}) VALUES (${queryPlaceHolders.join(',')}) RETURNING id;`

  braveDebugLib.verbose(`Inserting into ${table}: ${JSON.stringify(colToValueMap)}`)
  const insertRs = await client.query(insertQuery, values)
  return insertRs.rows[0].id
}

const _makeGetIdHashFunc = (table, textColumn) => {
  const idCache = Object.create(null)
  const selectQuery = `
    SELECT
      id
    FROM
      ${table}
    WHERE
      sha256 = $1::character(64)
    LIMIT
      1;
  `
  const insertQuery = `
    INSERT INTO
      ${table} (
        ${textColumn},
        sha256
      )
    VALUES (
      $1::text,
      $2::character(64)
    )
    ON CONFLICT
      (sha256) DO NOTHING
    RETURNING
      id;
  `

  return async (client, value) => {
    const hashValue = braveHashLib.sha256(value)

    if (idCache[hashValue] !== undefined) {
      const cachedValue = idCache[hashValue]
      braveDebugLib.verbose(`Found cached value of ${cachedValue} for ${value} in ${table}`)
      return cachedValue
    }

    await client.query('BEGIN')
    const selectParams = [hashValue]
    const selectRs = await client.query(selectQuery, selectParams)
    if (selectRs && selectRs.rows[0]) {
      const rowId = selectRs.rows[0].id
      braveDebugLib.verbose(`${value} has ${table}.id = ${rowId}`)
      idCache[hashValue] = rowId
      await client.query('END')
      return rowId
    }

    const insertParams = [value, hashValue]
    const insertRs = await client.query(insertQuery, insertParams)
    if (insertRs && insertRs.rows[0]) {
      const rowId = insertRs.rows[0].id
      braveDebugLib.verbose(`${value} has ${table}.id = ${rowId}`)
      idCache[hashValue] = rowId
      await client.query('END')
      return rowId
    }

    await client.query('END')
    throw new Error(`Error: Unexpectedly couldn't find an id for ${value} in ${table}`)
  }
}

const _makeGetIdFunc = (table, textColumn) => {
  const idCache = Object.create(null)
  const selectQuery = `
    SELECT
      id
    FROM
      ${table}
    WHERE
      ${textColumn} = $1::text
    LIMIT
      1;
  `
  const insertQuery = `
    INSERT INTO
      ${table} (
        ${textColumn}
      )
    VALUES (
      $1::text
    )
    ON CONFLICT
      (${textColumn}) DO NOTHING
    RETURNING
      id;
  `

  return async (client, value) => {
    if (idCache[value] !== undefined) {
      const cachedValue = idCache[value]
      braveDebugLib.verbose(`Found cached value of ${cachedValue} for ${value} in ${table}`)
      return cachedValue
    }

    await client.query('BEGIN')
    const selectParams = [value]
    const selectRs = await client.query(selectQuery, selectParams)
    if (selectRs && selectRs.rows[0]) {
      const rowId = selectRs.rows[0].id
      braveDebugLib.verbose(`${value} has ${table}.id = ${rowId}`)
      idCache[value] = rowId
      await client.query('END')
      return rowId
    }

    const insertParams = [value, value]
    const insertRs = await client.query(insertQuery, insertParams)
    if (insertRs && insertRs.rows[0]) {
      const rowId = insertRs.rows[0].id
      braveDebugLib.verbose(`${value} has ${table}.id = ${rowId}`)
      idCache[value] = rowId
      await client.query('END')
      return rowId
    }

    await client.query('END')
    throw new Error(`Error: Unexpectedly couldn't find an id for ${value} in ${table}`)
  }
}

const getClient = async _ => {
  const client = new pgLib.Client({
    user: _config.pg.username,
    host: _config.pg.host,
    database: 'slim_lists_db',
    password: _config.pg.password,
    port: _config.pg.port
  })
  client.connect()
  braveDebugLib.verbose('Connected to database')
  return client
}

const closeClient = async client => {
  await client.end()
}

const _idForBatchCache = Object.create(null)
const _idForBatch = async (client, batchUuid) => {
  if (_idForBatchCache[batchUuid] !== undefined) {
    return _idForBatchCache[batchUuid]
  }

  const selectQuery = `
    SELECT
      b.id
    FROM
      batches AS b
    WHERE
      b.batch = $1
    LIMIT
      1
  `

  // The lambda logic ensures that there will always be
  // a batch with the given uuid when this function is called.
  const selectRs = await client.query(selectQuery, [batchUuid])
  const batchId = selectRs.rows[0].id

  _idForBatchCache[batchUuid] = batchId
  return batchId
}

const _idForDomain = _makeGetIdHashFunc('domains', 'domain')
const _idForRule = _makeGetIdHashFunc('rules', 'rule')
const _idForUrl = _makeGetIdHashFunc('urls', 'url')
const _idForTag = _makeGetIdFunc('tags', 'name')
const _idForRequestType = _makeGetIdHashFunc('request_types', 'name')

const recordBatchWithTags = async (client, batch, timestamp, tags) => {
  const batchId = await _insertWithId(client, 'batches', {
    batch: batch,
    created_on: timestamp
  })

  for (const aTag of tags) {
    const aTagId = await _idForTag(client, aTag)
    await _insertWithId(client, 'batches_tags', {
      batch_id: batchId,
      tag_id: aTagId
    })
  }

  return batchId
}

const _idForExistingFilterList = async (client, filterListHash) => {
  braveDebugLib.verbose(`Checking to see if filter list hash=${filterListHash} already exists`)
  const selectQuery = 'SELECT id FROM filter_lists WHERE sha256 = $1 LIMIT 1;'
  const selectParams = [filterListHash]
  const selectRs = await client.query(selectQuery, selectParams)
  return (selectRs.rows && selectRs.rows.length === 1)
    ? selectRs.rows[0].id
    : undefined
}

const _idsForRulesForList = async (client, rules, listId) => {
  braveDebugLib.verbose('About to record ' + rules.length + ' filter rules for this list')
  const insertParams = []
  const insertTerms = []
  const hashTerms = []
  let index = 0
  Array.from(new Set(rules)).forEach(rule => {
    const ruleHash = braveHashLib.sha256(rule)
    insertParams.push(rule)
    hashTerms.push(`'${ruleHash}'`)
    insertTerms.push(`($${++index}::text, '${ruleHash}')`)
  })

  const insertQuery = `
    INSERT INTO
      rules (rule, sha256)
    VALUES
      ${insertTerms.join(',')}
    ON CONFLICT (sha256) DO NOTHING;`
  await client.query(insertQuery, insertParams)

  const selectQuery = `
    SELECT
      id
    FROM
      rules
    WHERE
      sha256 IN (${hashTerms.join(',')})`
  const selectRs = await client.query(selectQuery, [])

  const joinQueryValues = []
  for (const row of selectRs.rows) {
    const ruleId = row.id
    joinQueryValues.push(`(${listId}, ${ruleId})`)
  }

  const insertJoinQuery = `
    INSERT INTO
      filter_lists_rules(filter_list_id, rule_id)
    VALUES
      ${joinQueryValues.join(',')}`
  await client.query(insertJoinQuery, [])
}

const recordFilterRules = async (client, filterListUrl, timestamp,
  filterListHash, rules) => {
  const dateId = await _insertWithId(client, 'dates', {
    timestamp: timestamp
  })
  const idForExistingFilterList = await _idForExistingFilterList(client, filterListHash)
  if (idForExistingFilterList) {
    await _insertWithId(client, 'dates_filter_lists', {
      filter_list_id: idForExistingFilterList,
      date_id: dateId
    })
    return
  }

  const filterListUrlId = await _idForUrl(client, filterListUrl.trim())
  const filterListId = await _insertWithId(client, 'filter_lists', {
    url_id: filterListUrlId,
    sha256: filterListHash
  })
  await _insertWithId(client, 'dates_filter_lists', {
    filter_list_id: filterListId,
    date_id: dateId
  })

  // maximum number of rows to up-cert at the same time.
  const chunkSize = 5000
  const numChunks = Math.ceil(rules.length / chunkSize)

  for (let i = 0; i < numChunks; i += 1) {
    const startIndex = i * chunkSize
    const ruleChunk = rules.slice(startIndex, startIndex + chunkSize)
    await _idsForRulesForList(client, ruleChunk, filterListId)
  }
}

const _idForPage = async (client, batch, domain, pageUrl, depth, breath, timestamp) => {
  const batchId = await _idForBatch(client, batch)
  const domainId = await _idForDomain(client, domain)
  const pageUrlId = await _idForUrl(client, pageUrl.trim())

  return _insertWithId(client, 'pages', {
    url_id: pageUrlId,
    domain_id: domainId,
    batch_id: batchId,
    depth: depth,
    breath: breath,
    crawled_on: timestamp
  })
}

const _recordAllowedRequest = async (client, pageId, timestamp, parentFrameId,
  frameId, frameUrl, requestType, requestUrl, responseHash) => {
  const frameUrlId = await _idForUrl(client, frameUrl.trim())
  const requestUrlId = await _idForUrl(client, requestUrl.trim())
  const requestTypeId = await _idForRequestType(client, requestType.trim())

  const dbFrameId = await _insertWithId(client, 'frames', {
    page_id: pageId,
    url_id: frameUrlId,
    chrome_frame_id: frameId,
    chrome_parent_frame_id: parentFrameId
  })

  await _insertWithId(client, 'requests', {
    url_id: requestUrlId,
    frame_id: dbFrameId,
    request_type_id: requestTypeId,
    is_blocked: false,
    rule_id: null,
    excepting_rule_id: null,
    response_sha256: responseHash,
    requested_at: timestamp
  })
}

const _recordBlockedRequest = async (client, pageId, timestamp, parentFrameId,
  frameId, frameUrl, requestType, requestUrl, responseHash, ignore, blockingRule,
  exceptingRule) => {
  const frameUrlId = await _idForUrl(client, frameUrl.trim())
  const requestUrlId = await _idForUrl(client, requestUrl.trim())
  const requestTypeId = await _idForRequestType(client, requestType.trim())

  const dbFrameId = await _insertWithId(client, 'frames', {
    page_id: pageId,
    url_id: frameUrlId,
    chrome_frame_id: frameId,
    chrome_parent_frame_id: parentFrameId
  })

  const blockingRuleId = await _idForRule(client, blockingRule.trim())
  const exceptingRuleId = exceptingRule
    ? await _idForRule(client, exceptingRule.trim())
    : null

  await _insertWithId(client, 'requests', {
    url_id: requestUrlId,
    frame_id: dbFrameId,
    request_type_id: requestTypeId,
    is_blocked: (exceptingRuleId === null),
    rule_id: blockingRuleId,
    excepting_rule_id: exceptingRuleId,
    response_sha256: responseHash,
    requested_at: timestamp
  })
}

const recordPage = async (client, batch, domain, pageUrl, depth, breath, pageTimestamp, allowedRequests, blockedRequests) => {
  const pageId = await _idForPage(client, batch, domain, pageUrl, depth, breath, pageTimestamp)

  for (const anAllowedRequest of allowedRequests) {
    await _recordAllowedRequest(client, pageId, ...anAllowedRequest)
  }

  for (const aBlockedRequest of blockedRequests) {
    await _recordBlockedRequest(client, pageId, ...aBlockedRequest)
  }
}

const popularExceptionRules = async (client, earliestTimestamp, maxRules) => {
  const selectQuery = `
    SELECT
      r.excepting_rule_id
    FROM
      batches AS b
    JOIN
      pages AS p ON (p.batch_id = b.id)
    JOIN
      frames AS f ON (f.page_id = p.id)
    JOIN
      requests AS r ON (r.frame_id = f.id)
    WHERE
      b.created_on >= $1 AND
      r.excepting_rule_id IS NOT NULL
    GROUP BY
      r.excepting_rule_id
    ORDER BY
      COUNT(*) DESC
    LIMIT
      ${maxRules};`

  const selectRs = await client.query(selectQuery, [earliestTimestamp])
  if (selectRs.rows.length === 0) {
    return []
  }
  const ruleIds = selectRs.rows.map(row => row.excepting_rule_id)

  const ruleSelectQuery = `
    SELECT
      r.rule
    FROM
      rules AS r
    WHERE
      r.id IN (${ruleIds.join(',')})`
  const ruleSelectRs = await client.query(ruleSelectQuery, [])
  return ruleSelectRs.rows.map(row => row.rule)
}

const popularBlockingRules = async (client, earliestTimestamp, maxRules) => {
  const selectQuery = `
    SELECT
      r.rule_id
    FROM
      batches AS b
    JOIN
      pages AS p ON (p.batch_id = b.id)
    JOIN
      frames AS f ON (f.page_id = p.id)
    JOIN
      requests AS r ON (r.frame_id = f.id)
    WHERE
      b.created_on >= $1 AND
      r.rule_id IS NOT NULL
    GROUP BY
      r.rule_id
    ORDER BY
      COUNT(*) DESC
    LIMIT
      ${maxRules};`

  const selectRs = await client.query(selectQuery, [earliestTimestamp])
  if (selectRs.rows.length === 0) {
    return []
  }
  const ruleIds = selectRs.rows.map(row => row.rule_id)

  const ruleSelectQuery = `
    SELECT
      r.rule
    FROM
      rules AS r
    WHERE
      r.id IN (${ruleIds.join(',')})`
  const ruleSelectRs = await client.query(ruleSelectQuery, [])
  return ruleSelectRs.rows.map(row => row.rule)
}

module.exports = {
  getClient,
  closeClient,
  popularExceptionRules,
  popularBlockingRules,
  recordBatchWithTags,
  recordFilterRules,
  recordPage
}
