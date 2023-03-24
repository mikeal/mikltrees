/* globals describe, it */
import { deepStrictEqual as same } from 'assert'
import { create, load } from '../src/sparse-array.js'
import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { nocache } from '../src/cache.js'
import { bf, simpleCompare as compare } from '../src/utils.js'

const chunker = bf(3)

const cache = nocache

const storage = () => {
  const blocks = {}
  const put = block => {
    blocks[block.cid.toString()] = block
  }
  const get = async cid => {
    const block = blocks[cid.toString()]
    if (!block) throw new Error('Not found')
    return block
  }
  return { get, put, blocks }
}

const opts = { cache, chunker, codec, hasher }

const verify = (check, node) => {
  same(check.isLeaf, node.isLeaf)
  same(check.isBranch, node.isBranch)
  same(check.entries, node.entryList.entries.length)
  same(check.closed, node.closed)
}

const createList = entries => entries.map(([key, value]) => ({ key, value }))
const v = 'value'
const list = createList([
  [1, v],
  [2, v],
  [10, v],
  [15, v],
  [20, v],
  [200, v],
  [210, v],
  [290, v],
  [300, v],
  [10000, v]
])

describe('sparse array', () => {
  it('basic create', async () => {
    const { get, put } = storage()
    const checks = [
      [true, undefined, 2, true],
      [true, undefined, 1, true],
      [true, undefined, 1, true],
      [true, undefined, 4, true],
      [true, undefined, 2, false],
      [undefined, true, 4, true],
      [undefined, true, 1, false],
      [undefined, true, 2, true]
    ].map(([isLeaf, isBranch, entries, closed]) => ({ isLeaf, isBranch, entries, closed }))
    let root
    for await (const node of create({ get, compare, list, ...opts })) {
      const address = await node.address
      same(address.asCID, address)
      verify(checks.shift(), node)
      await put(await node.block)
      root = node
    }
    const cid = await root.address
    root = await load({ cid, get, compare, ...opts })
    for (const { key } of list) {
      same((await root.get(key)).result, v)
    }
  })
  it('getEntries & getMany', async () => {
    const { get, put } = storage()
    let root
    for await (const node of create({ get, compare, list, ...opts })) {
      await put(await node.block)
      root = node
    }
    const { result: entries } = await root.getEntries([2, 10000])
    same(entries.length, 2)
    const [a, b] = entries
    same(a.key, 2)
    same(a.value, v)
    same(b.key, 10000)
    same(b.value, v)
    const { result: values } = await root.getMany([2, 10000])
    same(values, [v, v])
  })
  it('getRangeEntries', async () => {
    const { get, put } = storage()
    let root
    for await (const node of create({ get, compare, list, ...opts })) {
      await put(await node.block)
      root = node
    }
    const verify = (entries, start, end) => {
      const keys = entries.map(entry => entry.key)
      const comp = list.slice(start, end).map(({ key }) => key)
      same(keys, comp)
    }
    const range = async (...args) => (await root.getRangeEntries(...args)).result
    let entries = await range(2, 400)
    verify(entries, 1, 9)
    entries = await range(0, 99999)
    verify(entries)
    entries = await range(1, 10000)
    verify(entries, 0, 9)
    entries = await range(1, 15)
    verify(entries, 0, 3)
    same(await root.getLength(), 10001)
  })
  it('bulk', async () => {
    const { get, put } = storage()
    let root
    let leaf
    for await (const node of create({ get, compare, list, ...opts })) {
      if (node.isLeaf) leaf = node
      await put(await node.block)
      root = node
    }
    same(await leaf.getLength(), 10001)
    same(await root.getLength(), 10001)
    const { blocks, root: lRoot } = await leaf.bulk([{ key: 10001, value: 'test' }], {}, false)
    await Promise.all(blocks.map(put))
    same((await lRoot.get(10001)).result, 'test')
    const { blocks: _blocks, root: bRoot } = await root.bulk([{ key: 10001, value: 'test2' }])
    await Promise.all(_blocks.map(put))
    same((await bRoot.get(10001)).result, 'test2')
  })
})
