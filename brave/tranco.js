'use strict'

/**
 * @file
 * Helper functions to fetch Tranco determined popular lists.
 */

/**
 *
 */
const get = async (count = 1000) => {
  // First figure out what the ID of the current Tranco list is.
  const trancoId = await fetch('https://tranco-list.eu/top-1m-id').then(r => r.text())
  const trancoUrl = `https://tranco-list.eu/download/${trancoId}/${count}`
  const trancoRs = (await fetch(trancoUrl).then(r => r.text())).trim()
  return [trancoUrl, trancoRs.split('\r\n').map(line => line.split(',')[1])]
}

module.exports = {
  get
}
