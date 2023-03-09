import { create as mapCreate, load as mapLoad, MapLeaf, MapBranch, MapLeafEntry, MapBranchEntry } from './map.js'
import { simpleCompare } from './utils.js'

const compare = (a, b) => {
  const [aKey, aRef] = a
  const [bKey, bRef] = b
  const comp = simpleCompare(aKey, bKey)
  if (comp !== 0) return comp
  return simpleCompare(aRef, bRef)
}

const getIndex = async (node, key) => {
  const start = [key, 0]
  const end = [key, Infinity]
  const { result: entries, cids } = await node.getRangeEntries(start, end)
  return { result: entries.map(entry => ({ id: entry.key[1], row: entry.value })), cids }
}

const getRange = async (node, start, end) => {
  start = [start, 0]
  end = [end, Infinity]
  const { result: entries, cids } = await node.getRangeEntries(start, end)
  const result = entries.map(entry => {
    const [id, key] = entry.key
    return { id, key, row: entry.value }
  })
  return { result, cids }
}

class DBIndexLeaf extends MapLeaf {
  get (key) {
    return getIndex(this, key)
  }

  range (start, end) {
    return getRange(this, start, end)
  }

  bulk (bulk, opts = {}, isRoot = true) {
    return super.bulk(bulk, { ...classes, ...opts }, isRoot)
  }
}

class DBIndexBranch extends MapBranch {
  get (key) {
    return getIndex(this, key)
  }

  range (start, end) {
    return getRange(this, start, end)
  }

  bulk (bulk, opts = {}, isRoot = true) {
    return super.bulk(bulk, { ...classes, ...opts }, isRoot)
  }
}

const LeafClass = DBIndexLeaf
const BranchClass = DBIndexBranch

const classes = { LeafClass, BranchClass, LeafEntryClass: MapLeafEntry, BranchEntryClass: MapBranchEntry }

const defaults = { ...classes, compare }

const create = opts => {
  opts = { ...defaults, ...opts }
  return mapCreate(opts)
}
const load = opts => {
  opts = { ...defaults, ...opts }
  return mapLoad(opts)
}

export { create, load, DBIndexBranch, DBIndexLeaf }
