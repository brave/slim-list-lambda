'use strict'

/**
 * @file
 * Common functions used for validating lambda arguments.
 *
 * All functions return [bool, string|undefined].
 * If the given values are valid, the returns [true, undefined].  Otherwise,
 * returns false and a string describing the problem.
 */

const allOfTypeAndTruthy = (typeAsString, list) => {
  if (Array.isArray(list) === false) {
    return [false, `Given argument isn't an array, its a ${typeof list}.`]
  }

  for (const value of list) {
    const itemType = typeof value
    if (itemType !== typeAsString) {
      return [false,
                `Expected all items to be ${typeAsString}, but found ${itemType}.`]
    }

    if ((!!value) === false) {
      return [false, `Expected all items to be truthy, but found ${value}.`]
    }
  }

  return [true, undefined]
}

const ofTypeAndTruthy = (typeAsString, value) => {
  const itemType = typeof value
  if (itemType !== typeAsString) {
    return [false,
            `Expected all value to be ${typeAsString}, but found ${itemType}.`]
  }

  if ((!!value) === false) {
    return [false, `Expected value to be truthy, but found ${value}.`]
  }

  return [true, undefined]
}

const isPositiveNumber = value => {
  const valueType = typeof value
  if (valueType !== 'number') {
    return [false, `Expected argument to be a number, but found ${valueType}.`]
  }

  if (value < 0) {
    return [false, `Expected argument to be a positive number, but found ${value}.`]
  }

  return [true, undefined]
}

const isStringOfLength = (length, value) => {
  const valueType = typeof value
  if (valueType !== 'string') {
    return [false, `Expected argument to be a string, but found ${valueType}.`]
  }

  if (value.length !== length) {
    return [false, `Expected value to have length ${length}, but found ${value.length}.`]
  }

  return [true, undefined]
}

const isLessThanOrEqual = (otherValue, value) => {
  const otherValueType = typeof otherValue
  if (otherValueType !== 'number') {
    return [false, `Expected compared value to be type number, but found ${otherValueType}.`]
  }

  const thisValueType = typeof value
  if (thisValueType !== 'number') {
    return [false, `Expected measured value to be type number, but found ${thisValueType}.`]
  }

  if (value > otherValue) {
    return [false, `Expected this value to be less than or equal to ${otherValue}, but ${value} > ${otherValue}.`]
  }

  return [true, undefined]
}

const applyValidationRules = (initValues, rules) => {
  const validArgs = Object.create(null)

  for (const [key, value] of Object.entries(rules)) {
    const initialValue = initValues[key]
    if (initialValue === undefined) {
      if (Object.prototype.hasOwnProperty.call(value, 'default') === false) {
        return [false, `${key}: value is required but missing.`]
      }

      if (typeof value.default === 'function') {
        validArgs[key] = value.default()
      } else {
        validArgs[key] = value.default
      }
      continue
    }

    const validationFunc = value.validate
    if (validationFunc) {
      const [isValid, msg] = validationFunc(initialValue)

      if (isValid === false) {
        return [false, `${key}: ${msg}`]
      }
    }
    validArgs[key] = initialValue
  }

  return [true, validArgs]
}

module.exports = {
  allOfTypeAndTruthy,
  ofTypeAndTruthy,
  isPositiveNumber,
  isStringOfLength,
  isLessThanOrEqual,
  applyValidationRules
}
