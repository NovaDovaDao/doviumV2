// src/utils/bignumber.ts

import BigNumber from 'bignumber.js';

export const BN = BigNumber;

export function toBN(value: string | number | BigNumber | bigint): BigNumber {
    return new BigNumber(value.toString());
}

export function fromBN(value: BigNumber, decimals: number = 0): bigint {
    return BigInt(value.times(new BigNumber(10).pow(decimals)).integerValue(BigNumber.ROUND_DOWN).toString());
}