'use strict'

/**
 * @file
 * Functions for recording data to RDS.
 */

const pgLib = require('pg')

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

  const insertQuery = `INSERT INTO ${table}(${keys.join(',')}) VALUE (${queryPlaceHolders.join(',')}) RETURNING id;`

  braveDebugLib.verbose(`Inserting into ${table}: ${JSON.stringify(colToValueMap)}`)
  const insertRs = await client.query(insertQuery, values)
  return insertRs.rows[0].id
}

const _makeGetIdFunc = (table, textColumn, useHash, client, value) => {
  const idCache = Object.create(null)
  let queryColumn, insertQuery

  if (useHash === true) {
    queryColumn = 'sha256'
    insertQuery = `INSERT INTO ${table}(${textColumn}, sha256) VALUE ($1, $2) RETURNING id;`
  } else {
    queryColumn = textColumn
    insertQuery = `INSERT INTO ${table}(${textColumn}) VALUE ($1) RETURNING id;`
  }

  const selectQuery = `SELECT id FROM ${table} WHERE ${queryColumn} = $1 LIMIT 1;`

  return async (client, value) => {
    braveDebugLib.verbose(`Searching for ${value} in ${table}`)

    let queryValue, insertParams

    if (useHash === true) {
      queryValue = braveHashLib.sha256(value)
      insertParams = [value, queryValue]
    } else {
      queryValue = value
      insertParams = [value]
    }

    const selectParams = [queryValue]

    if (idCache[queryValue] !== undefined) {
      const cachedValue = idCache[queryValue]
      braveDebugLib.verbose(`Found cached value of ${cachedValue} for ${value} in ${table}`)
      return cachedValue
    }

    let rowId
    const selectRs = await client.query(selectQuery, selectParams)
    if (selectRs.rows && selectRs.rows.length === 1) {
      rowId = selectRs.rows[0].id
      braveDebugLib.verbose(`Found ${value} has ${table}.id = ${rowId}`)
      idCache[queryValue] = rowId
      return rowId
    }

    const insertRs = await client.query(insertQuery, insertParams)
    rowId = insertRs.rows[0].id
    braveDebugLib.verbose(`Inserted ${value} into ${table} with id = ${rowId}`)
    idCache[queryValue] = rowId
    return rowId
  }
}

const getClient = async _ => {
  const client = new pgLib.Client({
    user: _config.pg.username,
    host: _config.pg.host,
    database: 'slim-list',
    password: _config.pg.password,
    port: _config.pg.port
  })
  client.connect()
  braveDebugLib.verbose('Connected to database')
  return client
}

const _idForBatch = _makeGetIdFunc('batches', 'batch', false)
const _idForDomain = _makeGetIdFunc('domains', 'domain', true)
const _idForRule = _makeGetIdFunc('rules', 'rule', true)
const _idForUrl = _makeGetIdFunc('urls', 'url', true)
const _idForTag = _makeGetIdFunc('tags', 'name', false)
const _idForRequestType = _makeGetIdFunc('request_types', 'name', true)

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

const _filterListAlreadyRecorded = async (client, filterListHash) => {
  braveDebugLib.verbose(`Checking to see if filter list hash=${filterListHash} already exists`)
  const selectQuery = 'SELECT id FROM filter_lists WHERE sha256 = $1 LIMIT 1;'
  const selectParams = [filterListHash]
  const selectRs = await client.query(selectQuery, selectParams)
  return (selectRs.rows && selectRs.rows.length === 1)
}

const recordFilterRules = async (client, filterListUrl, timestamp,
  filterListHash, rules) => {
  const filterListAlreadyRecorded = await _filterListAlreadyRecorded(client, filterListHash)

  const filterListUrlId = await _idForUrl(client, filterListUrl.trim())
  const filterListId = await _insertWithId(client, 'filter_lists', {
    url_id: filterListUrlId,
    fetched_on: timestamp,
    sha256: filterListHash
  })

  if (filterListAlreadyRecorded) {
    return
  }

  for (const aRule of rules) {
    const aRuleId = await _idForRule(client, aRule.trim())
    await _insertWithId(client, 'filter_lists_rules', {
      filter_list_id: filterListId,
      rule_id: aRuleId
    })
  }
}

const _idForPage = async (client, batch, domain, pageUrl, depth, breath, timestamp) => {
  const batchId = await _idForBatch(client, batch)
  const domainId = await _idForDomain(client, domain)
  const pageUrlId = await _idForUrl(client, pageUrl)

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
    resource_type_id: requestTypeId,
    is_blocked: false,
    rule_id: null,
    excepting_rule_id: null,
    response_sha256: responseHash,
    requested_at: timestamp
  })
}

const _recordBlockedRequest = async (client, pageId, timestamp, parentFrameId,
  frameId, frameUrl, requestType, requestUrl, responseHash, blockingRule,
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
    resource_type_id: requestTypeId,
    is_blocked: true,
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

module.exports = {
  getClient,
  recordBatchWithTags,
  recordFilterRules,
  recordPage
}
