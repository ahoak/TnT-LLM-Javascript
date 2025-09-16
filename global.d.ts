declare module '@dsnp/parquetjs' {
  export const ParquetReader: any;
}
declare module 'js-tiktoken/lite' {
  export class Tiktoken {
    constructor(ranks: any);
    encode(str: string): number[];
    decode(tokens: number[]): string;
  }
}
declare module 'js-tiktoken/ranks/o200k_base' {
  const ranks: any;
  export default ranks;
}
