import { describe, expect, it } from 'vitest'
import { findLocalFund, parseCodeList, parseFundList } from './local-funds'

// Synthetic funds only: made-up numbers and names.
const list = {
  funds: {
    result: [
      {
        fundId: '5100001',
        fundName: 'Test Fund A',
        fundLongName: 'Test House (1A) Broad Equity Fund',
        listingStatusId: 1,
        classificationMajor: { code: 1, value: 'Equity' },
        classificationMain: { code: 2, value: 'Abroad' },
        classificationSecondary: { code: '', value: '' },
        exposureProfile: '4d',
        isin: 'IL0051000019',
        underlyingAsset: [
          { code: 3, value: 'Shares' },
          { code: 4, value: 'Shares' },
        ],
        fundType: [{ code: 1, value: 'Index tracking' }],
      },
      {
        fundId: 5100002,
        fundName: 'Test Fund B',
        fundLongName: null,
        classificationMajor: { code: 5, value: 'Bonds' },
        classificationMain: null,
        exposureProfile: '0A',
        isin: null,
        underlyingAsset: null,
        fundType: [],
      },
      { fundId: 'not-a-number', fundName: 'Broken' },
    ],
    total: 3,
  },
}
const shares = { shareExposureProfile: { result: [{ code: 4, value: 'Up to 120% of the fund' }] } }
const currencies = {
  currencyExposureProfile: {
    result: [
      { code: 'D', value: 'Over 50%' },
      { code: 'A', value: 'None' },
    ],
  },
}

describe('parseFundList', () => {
  it('reads funds and explains the exposure profile', () => {
    const funds = parseFundList(list, {
      shares: parseCodeList(shares, 'shareExposureProfile'),
      currencies: parseCodeList(currencies, 'currencyExposureProfile'),
    })
    expect(funds.size).toBe(2)
    expect(funds.get('5100001')).toEqual({
      id: '5100001',
      name: 'Test Fund A',
      longName: 'Test House (1A) Broad Equity Fund',
      classification: ['Equity', 'Abroad'],
      exposure: '4D',
      shareExposure: 'Up to 120% of the fund',
      currencyExposure: 'Over 50%',
      underlying: ['Shares'],
      types: ['Index tracking'],
      isin: 'IL0051000019',
    })
    expect(funds.get('5100002')).toMatchObject({
      longName: null,
      classification: ['Bonds'],
      shareExposure: null,
      currencyExposure: 'None',
      underlying: [],
      types: [],
      isin: null,
    })
  })

  it('works without the code lists and refuses other answers', () => {
    expect(parseFundList(list).get('5100001')).toMatchObject({
      exposure: '4D',
      shareExposure: null,
    })
    expect(() => parseFundList({ error: 'nope' })).toThrow()
    expect(parseFundList({ funds: {} }).size).toBe(0)
  })
})

describe('findLocalFund', () => {
  it('matches the typed number, ignoring leading zeros', () => {
    const funds = parseFundList(list)
    expect(findLocalFund(funds, ' 05100001 ')?.name).toBe('Test Fund A')
    expect(findLocalFund(funds, '5100009')).toBeNull()
    expect(findLocalFund(funds, 'VTI')).toBeNull()
  })
})
